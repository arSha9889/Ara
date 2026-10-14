import { getDeviceId } from '../device/deviceId.js';

export const E2EE_WEB_ALGORITHM = 'ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256';
export const E2EE_ATTACHMENT_MIME_TYPE = 'application/vnd.arachat.e2ee-attachment';
export const E2EE_ATTACHMENT_FILENAME = 'encrypted-attachment.arachat';

const DATABASE_NAME = 'arachat-e2ee-desktop-v1';
const DATABASE_VERSION = 1;
const IDENTITY_STORE = 'identities';
const TRUST_STORE = 'trusted-peer-signing-keys';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const E2EE_ENVELOPE_PLAINTEXT_MAX_BYTES = 16_368;
const E2EE_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'application/pdf', 'text/plain', 'application/octet-stream',
]);
const identityPromises = new Map();

export function isE2eeDesktopSupported() {
  return Boolean(window.isSecureContext && window.crypto?.subtle && window.indexedDB);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть защищённое хранилище Desktop-приложения.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IDENTITY_STORE)) {
        database.createObjectStore(IDENTITY_STORE, { keyPath: 'userId' });
      }
      if (!database.objectStoreNames.contains(TRUST_STORE)) {
        database.createObjectStore(TRUST_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(name, mode, callback) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(name, mode);
      const store = transaction.objectStore(name);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить криптографический ключ.'));
      transaction.onabort = () => reject(transaction.error || new Error('Операция с криптографическим ключом отменена.'));
      callback(store, (value) => { result = value; }, reject);
    });
  } finally {
    database.close();
  }
}

async function getStoredIdentity(userId) {
  return withStore(IDENTITY_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.get(userId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredIdentity(identity) {
  return withStore(IDENTITY_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put(identity);
    request.onsuccess = () => resolve(identity);
    request.onerror = () => reject(request.error);
  });
}

async function generateKeyPair(algorithm, generateUsages, privateKeyUsages = generateUsages) {
  const generated = await window.crypto.subtle.generateKey(algorithm, true, generateUsages);
  const privateData = await window.crypto.subtle.exportKey('pkcs8', generated.privateKey);
  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateData,
    algorithm,
    false,
    privateKeyUsages,
  );
  return { publicKey: generated.publicKey, privateKey };
}

async function exportPublicKey(key) {
  return bytesToBase64(new Uint8Array(await window.crypto.subtle.exportKey('raw', key)));
}

async function createIdentity(userId) {
  const [encryptionKeyPair, signingKeyPair] = await Promise.all([
    generateKeyPair({ name: 'ECDH', namedCurve: 'P-256' }, ['deriveKey', 'deriveBits']),
    generateKeyPair({ name: 'ECDSA', namedCurve: 'P-256' }, ['sign', 'verify'], ['sign']),
  ]);
  const [encryptionPublicKey, signingPublicKey] = await Promise.all([
    exportPublicKey(encryptionKeyPair.publicKey),
    exportPublicKey(signingKeyPair.publicKey),
  ]);
  return {
    userId,
    encryptionPrivateKey: encryptionKeyPair.privateKey,
    encryptionPublicKey,
    signingPrivateKey: signingKeyPair.privateKey,
    signingPublicKey,
  };
}

export async function getOrCreateE2eeDesktopIdentity(userId) {
  if (!isE2eeDesktopSupported()) {
    throw new Error('Сквозное шифрование недоступно в этом Desktop-приложении.');
  }
  if (identityPromises.has(userId)) return identityPromises.get(userId);

  const promise = (async () => {
    const existing = await getStoredIdentity(userId);
    if (existing?.encryptionPrivateKey && existing?.signingPrivateKey && existing.encryptionPublicKey && existing.signingPublicKey) {
      return existing;
    }
    const identity = await createIdentity(userId);
    await saveStoredIdentity(identity);
    return identity;
  })().finally(() => identityPromises.delete(userId));

  identityPromises.set(userId, promise);
  return promise;
}

export async function registerE2eeDesktopIdentity(userId, saveKey) {
  const identity = await getOrCreateE2eeDesktopIdentity(userId);
  await saveKey({
    device_id: getDeviceId(),
    encryption_public_key: identity.encryptionPublicKey,
    signing_public_key: identity.signingPublicKey,
    algorithm: E2EE_WEB_ALGORITHM,
  });
  return identity;
}

function bytesToBase64(bytes) {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return window.btoa(value);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !value || value.length > 131072 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Некорректный зашифрованный контейнер.');
  }
  const decoded = window.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function importEcdhPublicKey(value) {
  return window.crypto.subtle.importKey('raw', base64ToBytes(value), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

async function importSigningPublicKey(value) {
  return window.crypto.subtle.importKey('raw', base64ToBytes(value), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}

function additionalData(chatId, senderId, recipientId) {
  return TEXT_ENCODER.encode(`AraChat E2EE Web v1|${chatId}|${senderId}|${recipientId}`);
}

function attachmentAdditionalData(chatId, senderId) {
  return TEXT_ENCODER.encode(`AraChat E2EE attachment v1|${chatId}|${senderId}`);
}

function payloadToBytes(payload) {
  if (typeof payload === 'string') return TEXT_ENCODER.encode(payload);
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  throw new Error('Некорректные данные для шифрования сообщения.');
}

async function deriveMessageKey(privateKey, publicKey, salt, chatId, senderId, recipientId) {
  const sharedSecret = await window.crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const inputKey = await window.crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: TEXT_ENCODER.encode(`AraChat E2EE Web v1|${chatId}|${senderId}|${recipientId}`),
    },
    inputKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function canonicalEnvelopeData(envelope) {
  const recipients = Object.fromEntries(
    Object.entries(envelope.recipients)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([recipientId, recipient]) => [recipientId, {
        ciphertext: recipient.ciphertext,
        iv: recipient.iv,
        salt: recipient.salt,
      }]),
  );
  return JSON.stringify({
    version: envelope.version,
    algorithm: envelope.algorithm,
    sender_device_id: envelope.sender_device_id,
    sender_ephemeral_public_key: envelope.sender_ephemeral_public_key,
    sender_signing_public_key: envelope.sender_signing_public_key,
    recipients,
  });
}

function parseEnvelope(payload) {
  if (typeof payload !== 'string' || payload.length > 524288) {
    throw new Error('Некорректный зашифрованный контейнер.');
  }
  const envelope = JSON.parse(payload);
  if (
    !envelope
    || envelope.version !== 1
    || envelope.algorithm !== E2EE_WEB_ALGORITHM
    || typeof envelope.sender_device_id !== 'string'
    || !envelope.sender_device_id
    || typeof envelope.sender_ephemeral_public_key !== 'string'
    || typeof envelope.sender_signing_public_key !== 'string'
    || typeof envelope.signature !== 'string'
    || !envelope.recipients
    || typeof envelope.recipients !== 'object'
    || Array.isArray(envelope.recipients)
  ) {
    throw new Error('Некорректный зашифрованный контейнер.');
  }
  return envelope;
}

function recipientKeyId(key) {
  return `${key.user_id}:${key.device_id}`;
}

export async function encryptE2eePayload({ payload, chatId, senderId, recipientKeys, identity }) {
  const plaintext = payloadToBytes(payload);
  if (!plaintext.byteLength || plaintext.byteLength > E2EE_ENVELOPE_PLAINTEXT_MAX_BYTES) {
    throw new Error('Данные зашифрованного сообщения слишком велики.');
  }
  const keysByRecipientId = new Map(recipientKeys.map((key) => [recipientKeyId(key), key]));
  const participantIds = new Set(recipientKeys.map((key) => String(key.user_id)));
  const currentDeviceId = getDeviceId();
  if (
    participantIds.size !== 2
    || !participantIds.has(String(senderId))
    || !keysByRecipientId.has(`${senderId}:${currentDeviceId}`)
  ) {
    throw new Error('Не удалось получить ключи шифрования для этого чата.');
  }

  const ephemeralKeyPair = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const senderEphemeralPublicKey = await exportPublicKey(ephemeralKeyPair.publicKey);
  const recipients = {};

  await Promise.all([...keysByRecipientId.entries()].map(async ([recipientId, recipientKey]) => {
    if (recipientKey.algorithm !== E2EE_WEB_ALGORITHM) {
      throw new Error('У собеседника используется неподдерживаемый ключ шифрования.');
    }
    const [salt, iv, publicKey] = await Promise.all([
      window.crypto.getRandomValues(new Uint8Array(32)),
      window.crypto.getRandomValues(new Uint8Array(12)),
      importEcdhPublicKey(recipientKey.encryption_public_key),
    ]);
    const messageKey = await deriveMessageKey(ephemeralKeyPair.privateKey, publicKey, salt, chatId, senderId, recipientId);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(chatId, senderId, recipientId) },
      messageKey,
      plaintext,
    );
    recipients[recipientId] = {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
      salt: bytesToBase64(salt),
    };
  }));

  const unsignedEnvelope = {
    version: 1,
    algorithm: E2EE_WEB_ALGORITHM,
    sender_device_id: currentDeviceId,
    sender_ephemeral_public_key: senderEphemeralPublicKey,
    sender_signing_public_key: identity.signingPublicKey,
    recipients,
  };
  const signature = await window.crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.signingPrivateKey,
    TEXT_ENCODER.encode(canonicalEnvelopeData(unsignedEnvelope)),
  );
  return JSON.stringify({ ...unsignedEnvelope, signature: bytesToBase64(new Uint8Array(signature)) });
}

export async function encryptE2eeText({ text, chatId, senderId, recipientKeys, identity }) {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error('Текст сообщения не может быть пустым.');
  if (normalizedText.length > 4000) throw new Error('Сообщение слишком длинное.');
  return encryptE2eePayload({
    payload: normalizedText,
    chatId,
    senderId,
    recipientKeys,
    identity,
  });
}

export async function encryptE2eeAttachment({
  file,
  chatId,
  senderId,
  caption = '',
  mediaKind = null,
  durationSeconds = null,
}) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size < 0) {
    throw new Error('Не удалось прочитать файл для шифрования.');
  }
  if (typeof caption !== 'string' || caption.length > 4000) {
    throw new Error('Подпись к файлу слишком длинная.');
  }
  if (mediaKind !== null && !['voice', 'video_note'].includes(mediaKind)) {
    throw new Error('Некорректный тип записанного сообщения.');
  }
  if (
    (mediaKind !== null && (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0))
    || (mediaKind === null && durationSeconds !== null)
  ) {
    throw new Error('Некорректная длительность записанного сообщения.');
  }

  const [fileKey, iv, source] = await Promise.all([
    window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']),
    window.crypto.getRandomValues(new Uint8Array(12)),
    file.arrayBuffer(),
  ]);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: attachmentAdditionalData(chatId, senderId) },
    fileKey,
    source,
  );
  const rawKey = new Uint8Array(await window.crypto.subtle.exportKey('raw', fileKey));
  const name = typeof file.name === 'string' && file.name.trim() ? file.name.slice(0, 255) : 'attachment';
  const declaredMimeType = typeof file.type === 'string' ? file.type.split(';', 1)[0].trim().toLowerCase() : '';
  const mimeType = E2EE_ATTACHMENT_MIME_TYPES.has(declaredMimeType) ? declaredMimeType : 'application/octet-stream';

  return {
    encryptedFile: new File([ciphertext], E2EE_ATTACHMENT_FILENAME, { type: E2EE_ATTACHMENT_MIME_TYPE }),
    descriptor: {
      kind: 'attachment',
      version: 1,
      name,
      mime_type: mimeType,
      size_bytes: file.size,
      file_key: bytesToBase64(rawKey),
      file_iv: bytesToBase64(iv),
      caption: caption.trim(),
      ...(mediaKind ? { media_kind: mediaKind, duration_seconds: durationSeconds } : {}),
    },
  };
}

export function parseE2eeAttachmentDescriptor(payload) {
  try {
    const descriptor = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (
      !descriptor
      || descriptor.kind !== 'attachment'
      || descriptor.version !== 1
      || typeof descriptor.name !== 'string'
      || !descriptor.name
      || descriptor.name.length > 255
      || typeof descriptor.mime_type !== 'string'
      || !descriptor.mime_type
      || descriptor.mime_type.length > 128
      || !E2EE_ATTACHMENT_MIME_TYPES.has(descriptor.mime_type)
      || !Number.isSafeInteger(descriptor.size_bytes)
      || descriptor.size_bytes < 0
      || typeof descriptor.file_key !== 'string'
      || typeof descriptor.file_iv !== 'string'
      || (descriptor.caption !== undefined && (typeof descriptor.caption !== 'string' || descriptor.caption.length > 4000))
      || (descriptor.media_kind !== undefined && !['voice', 'video_note'].includes(descriptor.media_kind))
      || (
        descriptor.media_kind !== undefined
        && (!Number.isSafeInteger(descriptor.duration_seconds) || descriptor.duration_seconds <= 0)
      )
      || (descriptor.media_kind === undefined && descriptor.duration_seconds !== undefined)
    ) {
      return null;
    }
    if (base64ToBytes(descriptor.file_key).byteLength !== 32 || base64ToBytes(descriptor.file_iv).byteLength !== 12) {
      return null;
    }
    return {
      kind: 'attachment',
      version: 1,
      name: descriptor.name,
      mime_type: descriptor.mime_type,
      size_bytes: descriptor.size_bytes,
      file_key: descriptor.file_key,
      file_iv: descriptor.file_iv,
      caption: descriptor.caption || '',
      media_kind: descriptor.media_kind || null,
      duration_seconds: descriptor.media_kind ? descriptor.duration_seconds : null,
    };
  } catch {
    return null;
  }
}

export async function decryptE2eeAttachment({ ciphertext, descriptor, chatId, senderId }) {
  const attachment = parseE2eeAttachmentDescriptor(descriptor);
  if (!attachment || !ciphertext || typeof ciphertext.arrayBuffer !== 'function') {
    throw new Error('Некорректное зашифрованное вложение.');
  }
  const [fileKey, source] = await Promise.all([
    window.crypto.subtle.importKey('raw', base64ToBytes(attachment.file_key), { name: 'AES-GCM' }, false, ['decrypt']),
    ciphertext.arrayBuffer(),
  ]);
  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(attachment.file_iv),
      additionalData: attachmentAdditionalData(chatId, senderId),
    },
    fileKey,
    source,
  );
  return new Blob([plaintext], { type: attachment.mime_type });
}

async function readTrustedPeerSigningKey(userId, peerUserId, peerDeviceId) {
  return withStore(TRUST_STORE, 'readonly', (store, resolve, reject) => {
    const request = store.get(`${userId}:${peerUserId}:${peerDeviceId}`);
    request.onsuccess = () => resolve(request.result?.signingPublicKey || null);
    request.onerror = () => reject(request.error);
  });
}

async function trustPeerSigningKey(userId, peerUserId, peerDeviceId, signingPublicKey) {
  return withStore(TRUST_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put({ id: `${userId}:${peerUserId}:${peerDeviceId}`, signingPublicKey });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function decryptE2eePayload({ message, chatId, currentUserId, identity, chatKeys }) {
  try {
    const envelope = parseEnvelope(message.payload);
    const signatureKey = await importSigningPublicKey(envelope.sender_signing_public_key);
    const signatureValid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signatureKey,
      base64ToBytes(envelope.signature),
      TEXT_ENCODER.encode(canonicalEnvelopeData(envelope)),
    );
    if (!signatureValid) throw new Error('Подпись сообщения не прошла проверку.');

    const senderId = String(message.sender_id);
    const senderKey = chatKeys.find((key) => (
      String(key.user_id) === senderId && key.device_id === envelope.sender_device_id
    ));
    let verificationStatus = senderKey?.signing_public_key === envelope.sender_signing_public_key ? 'verified' : 'unverified';
    if (senderId !== String(currentUserId)) {
      const trustedKey = await readTrustedPeerSigningKey(String(currentUserId), senderId, envelope.sender_device_id);
      if (trustedKey && trustedKey !== envelope.sender_signing_public_key) {
        verificationStatus = 'key_changed';
      } else if (!trustedKey) {
        await trustPeerSigningKey(String(currentUserId), senderId, envelope.sender_device_id, envelope.sender_signing_public_key);
      }
    }

    const recipient = envelope.recipients[`${currentUserId}:${getDeviceId()}`];
    if (!recipient?.ciphertext || !recipient.iv || !recipient.salt) {
      throw new Error('На этом устройстве нет ключа для расшифрования сообщения.');
    }
    const [ephemeralPublicKey, salt] = await Promise.all([
      importEcdhPublicKey(envelope.sender_ephemeral_public_key),
      Promise.resolve(base64ToBytes(recipient.salt)),
    ]);
    const recipientId = `${currentUserId}:${getDeviceId()}`;
    const messageKey = await deriveMessageKey(identity.encryptionPrivateKey, ephemeralPublicKey, salt, chatId, senderId, recipientId);
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(recipient.iv),
        additionalData: additionalData(chatId, senderId, recipientId),
      },
      messageKey,
      base64ToBytes(recipient.ciphertext),
    );
    return { plaintext: new Uint8Array(plaintext), e2ee_status: verificationStatus };
  } catch {
    return { plaintext: null, e2ee_status: 'unavailable' };
  }
}

export async function decryptE2eeMessage({ message, chatId, currentUserId, identity, chatKeys }) {
  if (message.encryption_state !== 'e2ee_web_v1') return { ...message, e2ee_status: 'plain' };
  const { plaintext, e2ee_status: e2eeStatus } = await decryptE2eePayload({
    message,
    chatId,
    currentUserId,
    identity,
    chatKeys,
  });
  if (!plaintext) return { ...message, payload: '', e2ee_status: e2eeStatus };
  try {
    return { ...message, payload: TEXT_DECODER.decode(plaintext), e2ee_status: e2eeStatus };
  } catch {
    return { ...message, payload: '', e2ee_status: 'unavailable' };
  }
}

export async function signingKeyFingerprint(signingPublicKey) {
  const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', base64ToBytes(signingPublicKey)));
  return [...digest.slice(0, 18)]
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('')
    .match(/.{1,6}/g)
    .join(' ');
}
