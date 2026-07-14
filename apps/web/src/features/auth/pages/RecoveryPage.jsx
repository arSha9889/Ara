import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { resetPasswordWithRecoveryCode, verifyRecoveryCode } from '../api/authApi.js';

export function RecoveryPage() {
  const { t } = useI18n();
  const { saveSession } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nexus_id: '',
    recovery_code: '',
    new_password: '',
    repeat_password: '',
    device_id: getDeviceId(),
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleVerify() {
    setError('');
    setStatus('');
    setIsLoading(true);
    try {
      await verifyRecoveryCode({ nexus_id: form.nexus_id, recovery_code: form.recovery_code });
      setStatus(t('recovery.codeValid'));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setStatus('');
    setNewRecoveryCode('');
    if (form.new_password !== form.repeat_password) {
      setError(t('recovery.passwordsMismatch'));
      return;
    }
    setIsLoading(true);
    try {
      const result = await resetPasswordWithRecoveryCode({
        nexus_id: form.nexus_id,
        recovery_code: form.recovery_code,
        new_password: form.new_password,
        device_id: form.device_id,
      });
      saveSession({ accessToken: result.access_token, refreshToken: result.refresh_token, user: result.user });
      setNewRecoveryCode(result.recovery_code);
      setStatus(t('recovery.resetDone'));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="panel readable" onSubmit={handleSubmit}>
        <Link to="/" className="brand compact">
          <img className="brand-mark" src="/icons/nexus-icon-192.png" alt="" aria-hidden="true" />
          <span>Nexus</span>
        </Link>
        <h1>{t('recovery.title')}</h1>
        <p className="muted">{t('recovery.subtitle')}</p>
        <TextInput label={t('auth.nexusId')} inputMode="numeric" autoComplete="username" value={form.nexus_id} onChange={(event) => updateField('nexus_id', event.target.value)} required />
        <TextInput label={t('recovery.code')} value={form.recovery_code} onChange={(event) => updateField('recovery_code', event.target.value)} required />
        <div className="toolbar">
          <Button type="button" variant="secondary" onClick={handleVerify} disabled={isLoading || !form.nexus_id || !form.recovery_code}>{t('recovery.verify')}</Button>
        </div>
        <TextInput label={t('recovery.newPassword')} type="password" autoComplete="new-password" value={form.new_password} onChange={(event) => updateField('new_password', event.target.value)} required />
        <TextInput label={t('recovery.repeatPassword')} type="password" autoComplete="new-password" value={form.repeat_password} onChange={(event) => updateField('repeat_password', event.target.value)} required />
        {error ? <p className="error-text">{error}</p> : null}
        {status ? <p className="success-text">{status}</p> : null}
        {newRecoveryCode ? (
          <div className="info-card">
            <strong>{t('recovery.newCodeTitle')}</strong>
            <code>{newRecoveryCode}</code>
            <span className="muted">{t('recovery.newCodeHint')}</span>
            <Button type="button" onClick={() => navigate('/app')}>{t('recovery.goToApp')}</Button>
          </div>
        ) : null}
        {!newRecoveryCode ? <Button type="submit" disabled={isLoading}>{isLoading ? t('recovery.loading') : t('recovery.resetPassword')}</Button> : null}
      </form>
    </main>
  );
}
