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
      },
      {
        user_id: RECIPIENT_ID,
        device_id: 'recipient-device',
        encryption_public_key: recipientIdentity.encryptionPublicKey,
        signing_public_key: recipientIdentity.signingPublicKey,
        algorithm: ALGORITHM,
      },
    ];
    const payload = await encryptE2eeText({
      text: 'Проверка Desktop E2EE',
      chatId: CHAT_ID,
      senderId: SENDER_ID,
      recipientKeys,
      identity: senderIdentity,
    });

    const senderDecrypted = await decryptE2eeMessage({
      message: { encryption_state: 'e2ee_web_v1', sender_id: SENDER_ID, payload },
      chatId: CHAT_ID,
      currentUserId: SENDER_ID,
      identity: senderIdentity,
      chatKeys: recipientKeys,
    });

    assert.equal(senderDecrypted.payload, 'Проверка Desktop E2EE');
    assert.equal(senderDecrypted.e2ee_status, 'verified');

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
