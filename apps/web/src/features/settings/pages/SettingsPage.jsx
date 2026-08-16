import { useEffect, useRef, useState } from 'react';

import { LanguagePickerList } from '../../../shared/ui/LanguagePicker.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useAppFeedback } from '../../../app/providers/AppFeedbackProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useTheme } from '../../../app/providers/ThemeProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { Icon } from '../../../shared/ui/Icon.jsx';
import { LayoutModeSwitcher } from '../../../shared/ui/LayoutModeSwitcher.jsx';
import {
  confirmEmailChange,
  confirmPasswordChange,
  createPin,
  deleteAccount,
  resetPin,
  startEmailChange,
  startOAuth,
  startPasswordChange,
} from '../../auth/api/authApi.js';
import { updateMyProfile } from '../../profile/api/userApi.js';
import { getDevices, getLoginHistory, revokeDevice } from '../api/deviceApi.js';

function isApplePlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /iPhone|iPad|iPod|Macintosh/i.test(userAgent);
}

function loginHistoryLabel(t, value, labels) {
  return labels[value] ? t(labels[value]) : value;
}

const LOGIN_METHOD_LABELS = {
  email_register: 'settings.loginMethodEmailRegistration',
  password: 'settings.loginMethodPassword',
  pin: 'settings.loginMethodPin',
  yandex_id: 'settings.loginMethodYandex',
  vk_id: 'settings.loginMethodVk',
};

const LOGIN_RESULT_LABELS = {
  success: 'settings.loginResultSuccess',
  failed: 'settings.loginResultFailed',
};

function AppearanceSaveStatus({ status, onRetry }) {
  const { t } = useI18n();
  if (status.phase === 'idle') return null;

  const isSaving = status.phase === 'saving';
  const isError = status.phase === 'error';
  return (
    <p className={`appearance-save-status ${isSaving ? 'saving' : isError ? 'error' : 'saved'}`} role={isError ? 'alert' : 'status'} aria-live="polite">
      <Icon name={isSaving ? 'activity' : isError ? 'x' : 'check'} size={15} />
      <span>{isSaving ? t('settings.savingPreference') : isError ? t('settings.preferenceFailed') : t('settings.preferenceSaved')}</span>
      {isError ? <button type="button" onClick={onRetry}>{t('common.retry')}</button> : null}
    </p>
  );
}

function NotificationSettingsCard({ enabled, isSupported, permission, onEnable, onDisable }) {
  const { t } = useI18n();
  const isActive = enabled && permission === 'granted';
  const status = isActive
    ? 'granted'
    : permission === 'denied' || permission === 'unsupported' || !isSupported
      ? permission === 'denied' ? 'denied' : 'unsupported'
      : 'default';
  const title = isActive
    ? t('settings.notificationsEnabled')
    : status === 'denied'
      ? t('settings.notificationsDenied')
      : status === 'unsupported'
        ? t('settings.notificationsUnsupported')
        : t('settings.notificationsNotEnabled');
  const description = isActive
    ? t('settings.notificationsText')
    : status === 'denied'
      ? t('settings.notificationsDenied')
      : status === 'unsupported'
        ? t('settings.notificationsUnsupported')
        : t('settings.notificationsText');

  return (
    <article className={`notification-settings-card ${status}`} aria-live="polite">
      <div className="notification-settings-glow" aria-hidden="true" />
      <div className="notification-settings-content">
        <span className="notification-settings-icon" aria-hidden="true">
          <Icon name={isActive ? 'check' : status === 'denied' || status === 'unsupported' ? 'x' : 'bell'} size={22} strokeWidth={2.2} />
        </span>
        <div className="notification-settings-copy">
          <span className="notification-settings-status">
            <span className="notification-settings-status-dot" aria-hidden="true" />
            {t(`settings.notificationStatus.${status}`)}
          </span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="notification-settings-action">
        {isActive ? (
          <button className="button button-secondary" type="button" onClick={onDisable}>
            {t('settings.disableNotifications')}
          </button>
        ) : status === 'default' ? (
          <button className="button button-primary" type="button" onClick={onEnable}>
            <Icon name="bell" size={17} />
            {t('settings.enableNotifications')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function SettingsPage() {
  const { language, setLanguage, t } = useI18n();
  const { session, saveSession, clearSession } = useSession();
  const { theme, setTheme } = useTheme();
  const { notify } = useAppFeedback();
  const [devices, setDevices] = useState([]);
  const [history, setHistory] = useState([]);
  const [appearanceStatus, setAppearanceStatus] = useState({
    theme: { phase: 'idle' },
    language: { phase: 'idle' },
  });
  const appearanceRequestRef = useRef({ theme: 0, language: 0 });
  const [showLiquidGlassPrompt, setShowLiquidGlassPrompt] = useState(false);
  const { disableNotifications, enableNotifications, isEnabled: notificationsEnabled, isSupported, permission: notificationPermission, pushConfigured } = useNotifications();
  const [activeTab, setActiveTab] = useState('appearance');
  const [pinForm, setPinForm] = useState({ current_password: '', pin: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' });
  const [passwordConfirmation, setPasswordConfirmation] = useState(null);
  const [passwordCode, setPasswordCode] = useState('');
  const [emailForm, setEmailForm] = useState({ current_password: '', email: '' });
  const [emailVerification, setEmailVerification] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [securityEditor, setSecurityEditor] = useState(null);
  const currentDeviceId = getDeviceId();
  const activeDevices = devices.filter((device) => !device.revoked_at);
  const hasVerifiedEmail = Boolean(session.user?.profile?.email && session.user.profile.email_verified);
  const settingsTabs = [
    { id: 'appearance', icon: 'palette', label: t('settings.appearance') },
    { id: 'language', icon: 'globe', label: t('settings.language') },
    { id: 'notifications', icon: 'bell', label: t('settings.notifications') },
    { id: 'security', icon: 'shield', label: t('settings.security') },
  ];

  async function loadSecurityData() {
    const [deviceItems, historyItems] = await Promise.all([
      getDevices(session.accessToken),
      getLoginHistory(session.accessToken),
    ]);
    setDevices(deviceItems);
    setHistory(historyItems);
  }

  useEffect(() => {
    loadSecurityData().catch((err) => {
      notify({ kind: 'error', title: t('settings.security'), message: err.message, icon: 'shield' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    const dismissed = localStorage.getItem('nexus_liquid_glass_prompt_dismissed') === 'true';
    setShowLiquidGlassPrompt(isApplePlatform() && theme !== 'liquid_glass' && !dismissed);
  }, [theme]);

  async function handleRevokeDevice(deviceId) {
    try {
      await revokeDevice(session.accessToken, deviceId);
      await loadSecurityData();
      notify({ kind: 'success', title: t('settings.deviceRevoked'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.security'), message: err.message, icon: 'shield' });
    }
  }

  async function saveAppearancePreference(key, value, previousValue) {
    const requestId = appearanceRequestRef.current[key] + 1;
    appearanceRequestRef.current[key] = requestId;
    setAppearanceStatus((current) => ({ ...current, [key]: { phase: 'saving', value, previousValue } }));
    try {
      const payload = key === 'theme' ? { design_theme: value } : { language: value };
      const user = await updateMyProfile(session.accessToken, payload);
      if (appearanceRequestRef.current[key] !== requestId) return;
      saveSession({ ...session, user });
      setAppearanceStatus((current) => ({ ...current, [key]: { phase: 'saved', value, previousValue } }));
    } catch {
      if (appearanceRequestRef.current[key] !== requestId) return;
      if (key === 'theme') setTheme(previousValue);
      else setLanguage(previousValue);
      setAppearanceStatus((current) => ({ ...current, [key]: { phase: 'error', value, previousValue } }));
    }
  }

  function retryAppearancePreference(key) {
    const failedPreference = appearanceStatus[key];
    if (key === 'theme') setTheme(failedPreference.value);
    else setLanguage(failedPreference.value);
    saveAppearancePreference(key, failedPreference.value, failedPreference.previousValue);
  }

  function handleLanguageChange(nextLanguage) {
    if (nextLanguage === language) return;
    const previousLanguage = language;
    setLanguage(nextLanguage);
    saveAppearancePreference('language', nextLanguage, previousLanguage);
  }

  async function enableLiquidGlass() {
    const previousTheme = theme;
    setTheme('liquid_glass');
    localStorage.setItem('nexus_liquid_glass_prompt_dismissed', 'true');
    setShowLiquidGlassPrompt(false);
    await saveAppearancePreference('theme', 'liquid_glass', previousTheme);
  }

  function dismissLiquidGlassPrompt() {
    localStorage.setItem('nexus_liquid_glass_prompt_dismissed', 'true');
    setShowLiquidGlassPrompt(false);
  }

  async function handleEnableNotifications() {
    if (!isSupported) {
      const result = await enableNotifications();
      notify({ kind: 'error', title: t('settings.notifications'), message: result.status === 'ios_install_required'
        ? t('settings.notificationsInstallRequired')
        : result.status === 'insecure_context'
          ? t('settings.notificationsHttpsRequired')
          : t('settings.notificationsUnsupported'), icon: 'bell' });
      return;
    }

    const result = await enableNotifications();
    if (result.status === 'granted') {
      notify({ kind: 'success', title: t('settings.notificationsEnabled'), icon: 'bell' });
      return;
    }
    notify({ kind: 'error', title: t('settings.notifications'), message: result.status === 'denied'
      ? t('settings.notificationsDenied')
      : result.status === 'unconfigured'
        ? t('settings.notificationsUnavailable')
        : result.status === 'subscription_failed'
          ? t('settings.notificationsSubscriptionFailed')
          : result.status === 'delivery_failed'
            ? t('settings.notificationsDeliveryFailed')
            : result.status === 'ios_install_required'
              ? t('settings.notificationsInstallRequired')
              : result.status === 'insecure_context'
                ? t('settings.notificationsHttpsRequired')
                : t('settings.notificationsNotEnabled'), icon: 'bell' });
  }

  async function handleDisableNotifications() {
    try {
      await disableNotifications();
      notify({ kind: 'success', title: t('settings.notificationsDisabled'), icon: 'bell' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.notifications'), message: err.message, icon: 'bell' });
    }
  }

  async function handleCreatePin(event) {
    event.preventDefault();
    try {
      await createPin(session.accessToken, {
        current_password: pinForm.current_password,
        pin: pinForm.pin,
        device_id: getDeviceId(),
      });
      setPinForm({ current_password: '', pin: '' });
      notify({ kind: 'success', title: t('settings.pinSaved'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.devicePinTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleRemovePin() {
    try {
      await resetPin(session.accessToken, {
        current_password: pinForm.current_password,
        pin: null,
        device_id: getDeviceId(),
      });
      setPinForm({ current_password: '', pin: '' });
      notify({ kind: 'success', title: t('settings.pinRemoved'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.devicePinTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleStartPasswordChange(event) {
    event.preventDefault();
    try {
      const confirmation = await startPasswordChange(session.accessToken, { ...passwordForm, device_id: getDeviceId(), language });
      setPasswordConfirmation(confirmation);
      notify({ kind: 'success', title: t('settings.passwordConfirmationSent'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.changePasswordTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleConfirmPasswordChange() {
    if (!passwordConfirmation || passwordCode.length !== 6) return;
    try {
      await confirmPasswordChange(session.accessToken, {
        verification_id: passwordConfirmation.verification_id,
        code: passwordCode,
        device_id: getDeviceId(),
      });
      setPasswordForm({ current_password: '', new_password: '' });
      setPasswordConfirmation(null);
      setPasswordCode('');
      notify({ kind: 'success', title: t('settings.passwordChanged'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.changePasswordTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleStartEmailChange(event) {
    event.preventDefault();
    try {
      const started = await startEmailChange(session.accessToken, { ...emailForm, device_id: getDeviceId(), language });
      setEmailVerification(started);
      notify({ kind: 'success', title: t('settings.emailCodeSent'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.emailChangeTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleConfirmEmailChange() {
    if (!emailVerification || emailCode.length !== 6) return;
    try {
      const user = await confirmEmailChange(session.accessToken, {
        verification_id: emailVerification.verification_id,
        code: emailCode,
        device_id: getDeviceId(),
      });
      saveSession({ ...session, user });
      setEmailForm({ current_password: '', email: '' });
      setEmailVerification(null);
      setEmailCode('');
      notify({ kind: 'success', title: t('settings.emailChanged'), icon: 'shield' });
    } catch (err) {
      notify({ kind: 'error', title: t('settings.emailChangeTitle'), message: err.message, icon: 'shield' });
    }
  }

  async function handleOAuthLink(provider) {
    try {
      sessionStorage.setItem('arachat_oauth_flow', 'link');
      const started = await startOAuth(provider, { device_id: getDeviceId() }, session.accessToken);
      window.location.assign(started.authorization_url);
    } catch (err) {
      sessionStorage.removeItem('arachat_oauth_flow');
      notify({ kind: 'error', title: t('settings.security'), message: err.message, icon: 'shield' });
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t('settings.deleteAccountConfirm'))) return;
    try {
      await disableNotifications().catch(() => undefined);
      await deleteAccount(session.accessToken);
      clearSession();
    } catch (err) {
      notify({ kind: 'error', title: t('settings.deleteAccount'), message: err.message, icon: 'trash' });
    }
  }

  return (
    <section className="panel settings-control-center">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">AraChat</p>
          <h1>{t('settings.title')}</h1>
        </div>
      </header>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label={t('settings.title')}>
          {settingsTabs.map((tab) => (
            <button
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="settings-tab-icon" aria-hidden="true"><Icon name={tab.icon} size={17} /></span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {activeTab === 'appearance' ? (
            <section className="settings-section" role="tabpanel">
              <div className="settings-section-heading">
                <span className="settings-heading-icon"><Icon name="palette" size={20} /></span>
                <div>
                  <h2>{t('settings.appearance')}</h2>
                  <p className="muted">{t('settings.theme')}</p>
                </div>
              </div>
              {showLiquidGlassPrompt ? (
                <div className="liquid-glass-prompt">
                  <div>
                    <strong>{t('settings.liquidGlassTitle')}</strong>
                    <p className="muted">{t('settings.liquidGlassText')}</p>
                  </div>
                  <div className="toolbar">
                    <button className="button button-primary" type="button" onClick={enableLiquidGlass}>{t('settings.enableLiquidGlass')}</button>
                    <button className="button button-secondary" type="button" onClick={dismissLiquidGlassPrompt}>{t('common.notNow')}</button>
                  </div>
                </div>
              ) : null}
              <label className="field inline-field">
                <span>{t('settings.theme')}</span>
                <ThemeSwitcher onChange={(designTheme) => saveAppearancePreference('theme', designTheme, session.user?.profile?.design_theme || 'halo')} />
              </label>
              <AppearanceSaveStatus
                status={appearanceStatus.theme}
                onRetry={() => retryAppearancePreference('theme')}
              />
              <LayoutModeSwitcher />
            </section>
          ) : null}
          {activeTab === 'language' ? (
            <section className="settings-section language-settings-section" role="tabpanel">
              <div className="settings-section-heading">
                <span className="settings-heading-icon"><Icon name="globe" size={20} /></span>
                <div>
                  <h2>{t('settings.languagePickerTitle')}</h2>
                  <p className="muted">{t('settings.languagePickerText')}</p>
                </div>
              </div>
              <LanguagePickerList selectedLanguage={language} onSelect={handleLanguageChange} />
              <AppearanceSaveStatus
                status={appearanceStatus.language}
                onRetry={() => retryAppearancePreference('language')}
              />
            </section>
          ) : null}
          {activeTab === 'notifications' ? (
            <section className="settings-section" role="tabpanel">
              <div className="settings-section-heading">
                <span className="settings-heading-icon"><Icon name="bell" size={20} /></span>
                <div>
                  <h2>{t('settings.notifications')}</h2>
                  <p className="muted">{t('settings.notificationsText')}</p>
                </div>
              </div>
              <NotificationSettingsCard
                enabled={notificationsEnabled}
                isSupported={isSupported}
                permission={notificationPermission}
                onEnable={handleEnableNotifications}
                onDisable={handleDisableNotifications}
              />
            </section>
          ) : null}
          {activeTab === 'security' ? (
            <section className="settings-section security-settings-section" role="tabpanel">
              <div className="settings-section-heading">
                <span className="settings-heading-icon"><Icon name="shield" size={20} /></span>
                <div>
                  <h2>{t('settings.security')}</h2>
                  <p className="muted">{t('settings.activeDevices')} · {t('settings.loginHistory')}</p>
                </div>
              </div>
              <section className="security-overview" aria-label={t('settings.securityStatusTitle')}>
                <div className="security-overview-icon" aria-hidden="true"><Icon name="shield" size={25} /></div>
                <div>
                  <p>{t('settings.securityStatusTitle')}</p>
                  <strong>{hasVerifiedEmail ? t('settings.securityStatusVerified') : t('settings.securityStatusNeedsAttention')}</strong>
                  <span>{hasVerifiedEmail ? t('settings.securityStatusVerifiedText') : t('settings.securityStatusNeedsAttentionText')}</span>
                </div>
                <div className="security-overview-stats">
                  <span>{t('settings.activeSessions')}</span>
                  <strong>{activeDevices.length}</strong>
                </div>
              </section>

              <section className="settings-subsection security-access-section">
                <h3>{t('settings.accountAccess')}</h3>
                <div className="security-access-grid">
                  <button className={`security-access-card ${securityEditor === 'email' ? 'active' : ''}`} type="button" onClick={() => setSecurityEditor((current) => current === 'email' ? null : 'email')}>
                    <span className="security-access-icon"><Icon name="mail" size={19} /></span>
                    <span><strong>{t('settings.emailAccess')}</strong><small>{session.user?.profile?.email || t('settings.emailNotSet')}</small></span>
                    <span className={`security-access-status ${hasVerifiedEmail ? 'verified' : 'attention'}`}>{hasVerifiedEmail ? t('settings.verified') : t('settings.unverified')}</span>
                  </button>
                  <button className={`security-access-card ${securityEditor === 'password' ? 'active' : ''}`} type="button" onClick={() => setSecurityEditor((current) => current === 'password' ? null : 'password')}>
                    <span className="security-access-icon"><Icon name="key" size={19} /></span>
                    <span><strong>{t('settings.changePasswordTitle')}</strong><small>{t('settings.passwordAccessText')}</small></span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  <button className={`security-access-card ${securityEditor === 'pin' ? 'active' : ''}`} type="button" onClick={() => setSecurityEditor((current) => current === 'pin' ? null : 'pin')}>
                    <span className="security-access-icon"><Icon name="smartphone" size={19} /></span>
                    <span><strong>{t('settings.devicePinTitle')}</strong><small>{t('settings.devicePinText')}</small></span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  <button className={`security-access-card ${securityEditor === 'accounts' ? 'active' : ''}`} type="button" onClick={() => setSecurityEditor((current) => current === 'accounts' ? null : 'accounts')}>
                    <span className="security-access-icon"><Icon name="user" size={19} /></span>
                    <span><strong>{t('settings.linkedAccountsTitle')}</strong><small>{t('settings.linkedAccountsText')}</small></span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </div>

                {securityEditor === 'password' ? <form className="security-editor-card" onSubmit={handleStartPasswordChange}>
                  <h4>{t('settings.changePasswordTitle')}</h4>
                  <p>{t('settings.changePasswordText')}</p>
                  <input className="text-input" type="password" placeholder={t('settings.currentPassword')} value={passwordForm.current_password} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required />
                  <input className="text-input" type="password" placeholder={t('settings.newPassword')} value={passwordForm.new_password} onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))} required />
                  <button className="button button-secondary" type="submit">{t('settings.requestPasswordConfirmation')}</button>
                  {passwordConfirmation ? <div className="password-confirmation-actions"><input className="text-input" inputMode="numeric" placeholder={t('settings.emailCode')} value={passwordCode} onChange={(event) => setPasswordCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button className="button button-primary" type="button" onClick={handleConfirmPasswordChange} disabled={passwordCode.length !== 6}>{t('settings.completeWithEmailCode')}</button></div> : null}
                </form> : null}
                {securityEditor === 'email' ? <form className="security-editor-card" onSubmit={handleStartEmailChange}>
                  <h4>{t('settings.emailChangeTitle')}</h4>
                  <p>{t('settings.emailChangeText')}</p>
                  <input className="text-input" type="password" placeholder={t('settings.currentPassword')} value={emailForm.current_password} onChange={(event) => setEmailForm((current) => ({ ...current, current_password: event.target.value }))} required />
                  <input className="text-input" type="email" placeholder="name@example.com" value={emailForm.email} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} required />
                  <button className="button button-secondary" type="submit">{t('settings.sendEmailCode')}</button>
                  {emailVerification ? <div className="password-confirmation-actions"><input className="text-input" inputMode="numeric" placeholder={t('settings.emailCode')} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button className="button button-primary" type="button" onClick={handleConfirmEmailChange} disabled={emailCode.length !== 6}>{t('settings.confirmEmailChange')}</button></div> : null}
                </form> : null}
                {securityEditor === 'pin' ? <form className="security-editor-card" onSubmit={handleCreatePin}>
                  <h4>{t('settings.devicePinTitle')}</h4>
                  <p>{t('settings.devicePinText')}</p>
                  <input className="text-input" type="password" placeholder={t('settings.currentPassword')} value={pinForm.current_password} onChange={(event) => setPinForm((current) => ({ ...current, current_password: event.target.value }))} required />
                  <input className="text-input" inputMode="numeric" placeholder={t('settings.newPin')} value={pinForm.pin} onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '').slice(0, 8) }))} required />
                  <div className="security-editor-actions"><button className="button button-secondary" type="submit">{t('settings.savePin')}</button><button className="button button-secondary" type="button" onClick={handleRemovePin} disabled={!pinForm.current_password}>{t('settings.removePin')}</button></div>
                </form> : null}
                {securityEditor === 'accounts' ? <section className="security-editor-card">
                  <h4>{t('settings.linkedAccountsTitle')}</h4>
                  <p>{t('settings.linkedAccountsText')}</p>
                  <div className="security-editor-actions"><button className="button button-secondary" type="button" onClick={() => handleOAuthLink('yandex')}>{t('settings.linkYandex')}</button><button className="button button-secondary" type="button" onClick={() => handleOAuthLink('vk')}>{t('settings.linkVk')}</button></div>
                </section> : null}
              </section>

              <section className="settings-subsection">
                <h3>{t('settings.activeDevices')}</h3>
                <div className="security-device-list">
                  {devices.length ? devices.map((device) => {
                    const isCurrentDevice = device.device_id === currentDeviceId;
                    return <article className={`security-device-card ${device.revoked_at ? 'revoked' : ''}`} key={device.id}>
                      <span className="security-device-icon"><Icon name="monitor" size={19} /></span>
                      <div><strong>{device.device_id}</strong><span>{t('settings.deviceCreated')} {new Date(device.created_at).toLocaleString(language)} · {t('settings.until')} {new Date(device.expires_at).toLocaleString(language)}</span></div>
                      <div className="security-device-actions">{isCurrentDevice ? <span className="security-access-status verified">{t('settings.currentDevice')}</span> : null}{device.revoked_at ? <span className="security-access-status muted">{t('settings.revoked')}</span> : <button className="button button-secondary" type="button" onClick={() => handleRevokeDevice(device.device_id)}>{t('settings.revoke')}</button>}</div>
                    </article>;
                  }) : <p className="security-empty-state">{t('settings.noDevices')}</p>}
                </div>
              </section>

              <section className="settings-subsection">
                <h3>{t('settings.loginHistory')}</h3>
                <div className="security-history-list">
                  {history.length ? history.map((item) => <article className="security-history-item" key={item.id}><span className="security-history-marker" aria-hidden="true" /><div><strong>{loginHistoryLabel(t, item.method, LOGIN_METHOD_LABELS)} · {loginHistoryLabel(t, item.result, LOGIN_RESULT_LABELS)}</strong><span>{item.device_id || t('settings.unknownDevice')} · {new Date(item.created_at).toLocaleString(language)}</span></div></article>) : <p className="security-empty-state">{t('settings.noLoginHistory')}</p>}
                </div>
              </section>

              <section className="security-danger-zone">
                <h3>{t('settings.dangerZone')}</h3>
                <p className="muted">{t('settings.deleteAccountText')}</p>
                <button className="button button-danger" type="button" onClick={handleDeleteAccount}>{t('settings.deleteAccount')}</button>
              </section>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
