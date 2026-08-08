import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { confirmPasswordReset, startPasswordReset } from '../api/authApi.js';


export function PasswordRecoveryPage() {
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const [form, setForm] = useState({ email: '', code: '', new_password: '', device_id: getDeviceId() });
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function requestCode(event) {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await startPasswordReset({ email: form.email, device_id: form.device_id, language });
      setRequested(true);
      setMessage(t('auth.recoveryCodeSent'));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await confirmPasswordReset(form);
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page"><form className="panel auth-card" onSubmit={requested ? resetPassword : requestCode}>
      <h1>{t('auth.recoveryTitle')}</h1><p className="muted">{t('auth.recoverySubtitle')}</p>
      <div className="auth-fields"><TextInput label="E-mail" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} required />
        {requested ? <><TextInput label={t('auth.recoveryEmailCode')} inputMode="numeric" value={form.code} onChange={(event) => updateField('code', event.target.value.replace(/\D/g, '').slice(0, 6))} required /><TextInput label={t('auth.recoveryNewPassword')} type="password" value={form.new_password} onChange={(event) => updateField('new_password', event.target.value)} required /></> : null}
      </div>
      {message ? <p className="muted">{message}</p> : null}
      <Button type="submit" disabled={isLoading}>{isLoading ? t('auth.recoveryChecking') : requested ? t('auth.recoveryResetPassword') : t('auth.recoverySendCode')}</Button>
      <Link className="auth-switch-link" to="/login">{t('common.backToLogin')}</Link>
    </form></main>
  );
}
