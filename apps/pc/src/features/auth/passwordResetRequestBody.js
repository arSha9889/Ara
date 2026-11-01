export function passwordResetStartRequestBody({ email, deviceId, language }) {
  return {
    email,
    device_id: deviceId,
    language,
  };
}

export function passwordResetConfirmRequestBody({ email, code, password, deviceId }) {
  return {
    email,
    code,
    new_password: password,
    device_id: deviceId,
  };
}
