export function registrationRequestBody({
  verificationId,
  username,
  password,
  deviceId,
  language,
  country,
  displayName,
  acceptedTerms,
  acceptedPrivacyPolicy,
}) {
  return {
    email_verification_id: verificationId,
    username,
    password,
    device_id: deviceId,
    language,
    registration_country: country,
    design_theme: 'halo',
    display_name: displayName,
    avatar_type: 'built_in',
    avatar_ref: 'animal-01',
    accepted_terms: Boolean(acceptedTerms),
    accepted_privacy_policy: Boolean(acceptedPrivacyPolicy),
  };
}
