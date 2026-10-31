import assert from 'node:assert/strict';
import test from 'node:test';

import { registrationRequestBody } from './registrationRequestBody.js';

test('передаёт в запросе фактические состояния согласий с документами', () => {
  const body = registrationRequestBody({
    verificationId: '00000000-0000-0000-0000-000000000001',
    username: 'arauser',
    password: 'password1',
    deviceId: 'desktop-device',
    language: 'ru',
    country: 'RU',
    displayName: 'Ara User',
    acceptedTerms: false,
    acceptedPrivacyPolicy: true,
  });

  assert.equal(body.accepted_terms, false);
  assert.equal(body.accepted_privacy_policy, true);
});
