import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { Button } from '../../../shared/ui/Button.jsx';
import { PUBLIC_LANGUAGE_IDS } from '../../../shared/ui/LanguagePicker.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { confirmPasswordReset, startPasswordReset } from '../api/authApi.js';
import { PublicSiteHeader } from '../../onboarding/components/PublicSiteHeader.jsx';


export function PasswordRecoveryPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const [form, setForm] = useState({ email: '', code: '', new_password: '', device_id: getDeviceId() });
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const publicLanguage = PUBLIC_LANGUAGE_IDS.includes(language) ? language : 'ru';

  useEffect(() => {
    if (language !== publicLanguage) {
      setLanguage(publicLanguage);
    }
  }, [language, publicLanguage, setLanguage]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function requestCode(event) {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      await startPasswordReset({ email: form.email, device_id: form.device_id, language: publicLanguage });
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
    <main className="public-page ara-page ara-auth-page">
      <div className="public-shell">
        <PublicSiteHeader minimal />
        <section className="auth-page">
          <form className="panel auth-card" onSubmit={requested ? resetPassword : requestCode}>
            <h1>{t('auth.recoveryTitle')}</h1><p className="muted">{t('auth.recoverySubtitle')}</p>
            <div className="auth-fields"><TextInput label="E-mail" name="email" type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={(event) => updateField('email', event.target.value)} required />
              {requested ? <><TextInput label={t('auth.recoveryEmailCode')} name="code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} value={form.code} onChange={(event) => updateField('code', event.target.value.replace(/\D/g, '').slice(0, 6))} required /><TextInput label={t('auth.recoveryNewPassword')} name="new_password" type="password" autoComplete="new-password" value={form.new_password} onChange={(event) => updateField('new_password', event.target.value)} required /></> : null}
            </div>
            {message ? <p className="muted" role="status" aria-live="polite">{message}</p> : null}
            <Button type="submit" disabled={isLoading}>{isLoading ? t('auth.recoveryChecking') : requested ? t('auth.recoveryResetPassword') : t('auth.recoverySendCode')}</Button>
            <Link className="auth-switch-link" to="/login">{t('common.backToLogin')}</Link>
          </form>
        </section>
      </div>
    </main>
  );
}
