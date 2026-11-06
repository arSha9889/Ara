import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

const ALGORITHM = 'ECDH_P256_HKDF_SHA256_A256GCM_ECDSA_P256';
const CHAT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SENDER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RECIPIENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function legacyPayloadFrom(payload, signingPrivateKey) {
  const envelope = JSON.parse(payload);
  const recipients = Object.fromEntries(Object.entries(envelope.recipients)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([recipientId, recipient]) => [recipientId, {
      ciphertext: recipient.ciphertext,
      iv: recipient.iv,
      salt: recipient.salt,
    }]));
  const legacyEnvelope = {
    version: 1,
    algorithm: envelope.algorithm,
    sender_device_id: envelope.sender_device_id,
    sender_ephemeral_public_key: envelope.sender_ephemeral_public_key,
    sender_signing_public_key: envelope.sender_signing_public_key,
    recipients,
  };
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingPrivateKey,
    new TextEncoder().encode(JSON.stringify(legacyEnvelope)),
  );
  return JSON.stringify({ ...legacyEnvelope, signature: bytesToBase64(new Uint8Array(signature)) });
}

async function createIdentity() {
  const encryption = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const signing = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    encryptionPrivateKey: await webcrypto.subtle.importKey(
      'pkcs8',
      await webcrypto.subtle.exportKey('pkcs8', encryption.privateKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits'],
    ),
    encryptionPublicKey: bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', encryption.publicKey))),
    signingPrivateKey: await webcrypto.subtle.importKey(
      'pkcs8',
      await webcrypto.subtle.exportKey('pkcs8', signing.privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    ),
    signingPublicKey: bytesToBase64(new Uint8Array(await webcrypto.subtle.exportKey('raw', signing.publicKey))),
  };
}

test('расшифровывает сообщение получателя, если хранилище доверенных ключей временно недоступно', async () => {
  const localStorage = new Map([['arachat-desktop-device-id', 'sender-device']]);
  const previousWindow = globalThis.window;
  globalThis.window = {
    isSecureContext: true,
    crypto: webcrypto,
    localStorage: {
      getItem: (key) => localStorage.get(key) ?? null,
      setItem: (key, value) => localStorage.set(key, String(value)),
    },
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  };

  try {
    const { decryptE2eeMessage, encryptE2eeText } = await import('./e2eeDesktop.js');
    const [senderIdentity, recipientIdentity] = await Promise.all([createIdentity(), createIdentity()]);
    const recipientKeys = [
      {
        user_id: SENDER_ID,
        device_id: 'sender-device',
        encryption_public_key: senderIdentity.encryptionPublicKey,
        signing_public_key: senderIdentity.signingPublicKey,
        algorithm: ALGORITHM,
        envelope_version: 2,
      },
      {
        user_id: RECIPIENT_ID,
        device_id: 'recipient-device',
        encryption_public_key: recipientIdentity.encryptionPublicKey,
        signing_public_key: recipientIdentity.signingPublicKey,
        algorithm: ALGORITHM,
        envelope_version: 2,
      },
    ];
    const payload = await encryptE2eeText({
      text: 'Проверка Desktop E2EE',
      chatId: CHAT_ID,
      senderId: SENDER_ID,
      recipientKeys,
      identity: senderIdentity,
    });
    const envelope = JSON.parse(payload);
    assert.equal(envelope.version, 2);
    assert.equal(
      envelope.recipients[`${RECIPIENT_ID}:recipient-device`].recipient_encryption_public_key,
      recipientIdentity.encryptionPublicKey,
    );

    const senderDecrypted = await decryptE2eeMessage({
      message: { encryption_state: 'e2ee_web_v1', sender_id: SENDER_ID, payload },
      chatId: CHAT_ID,
      currentUserId: SENDER_ID,
      identity: senderIdentity,
      chatKeys: recipientKeys,
    });

    assert.equal(senderDecrypted.payload, 'Проверка Desktop E2EE');
    assert.equal(senderDecrypted.e2ee_status, 'verified');

    const compatiblePayload = await encryptE2eeText({
      text: 'Сообщение для старого устройства',
      chatId: CHAT_ID,
      senderId: SENDER_ID,
      recipientKeys: recipientKeys.map((key, index) => ({ ...key, envelope_version: index ? 1 : 2 })),
      identity: senderIdentity,
    });
    const compatibleEnvelope = JSON.parse(compatiblePayload);
    assert.equal(compatibleEnvelope.version, 1);
    assert.equal(
      Object.hasOwn(compatibleEnvelope.recipients[`${RECIPIENT_ID}:recipient-device`], 'recipient_encryption_public_key'),
      false,
    );

    localStorage.set('arachat-desktop-device-id', 'recipient-device');
    const decrypted = await decryptE2eeMessage({
      message: { encryption_state: 'e2ee_web_v1', sender_id: SENDER_ID, payload },
      chatId: CHAT_ID,
      currentUserId: RECIPIENT_ID,
      identity: recipientIdentity,
      chatKeys: recipientKeys,
    });

    assert.equal(decrypted.payload, 'Проверка Desktop E2EE');
    assert.equal(decrypted.e2ee_status, 'unverified');

    const legacyDecrypted = await decryptE2eeMessage({
      message: {
        encryption_state: 'e2ee_web_v1',
        sender_id: SENDER_ID,
        payload: await legacyPayloadFrom(payload, senderIdentity.signingPrivateKey),
      },
      chatId: CHAT_ID,
      currentUserId: RECIPIENT_ID,
      identity: recipientIdentity,
      chatKeys: recipientKeys,
    });
    assert.equal(legacyDecrypted.payload, 'Проверка Desktop E2EE');

    const tamperedEnvelope = JSON.parse(payload);
    tamperedEnvelope.signature = `${tamperedEnvelope.signature[0] === 'A' ? 'B' : 'A'}${tamperedEnvelope.signature.slice(1)}`;
    const tampered = await decryptE2eeMessage({
      message: { encryption_state: 'e2ee_web_v1', sender_id: SENDER_ID, payload: JSON.stringify(tamperedEnvelope) },
      chatId: CHAT_ID,
      currentUserId: RECIPIENT_ID,
      identity: recipientIdentity,
      chatKeys: recipientKeys,
    });

    assert.equal(tampered.payload, '');
    assert.equal(tampered.e2ee_status, 'unavailable');
  } finally {
    globalThis.window = previousWindow;
  }
});
