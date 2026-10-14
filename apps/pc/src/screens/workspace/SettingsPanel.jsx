import { useCallback, useEffect, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { SUPPORTED_LANGUAGES } from '../../i18n/copy.js';
import { getDeviceId } from '../../shared/device/deviceId.js';
import {
  confirmEmailChange,
  confirmPasswordChange,
  createPin,
  getDevices,
  getLoginHistory,
  resetPin,
  revokeDevice,
  startEmailChange,
  startPasswordChange,
} from '../../features/security/securityApi.js';
import {
  notificationPermissionStatus,
  requestDesktopNotificationPermission,
} from '../../features/notifications/desktopNotifications.js';

const TABS = [
  { id: 'appearance', icon: 'palette' },
  { id: 'notifications', icon: 'bell' },
  { id: 'security', icon: 'shield' },
];

const LOGIN_METHODS = {
  email_register: 'loginMethodEmailRegistration',
  password: 'loginMethodPassword',
  pin: 'loginMethodPin',
  yandex_id: 'loginMethodYandex',
  vk_id: 'loginMethodVk',
};

const LOGIN_RESULTS = {
  success: 'loginResultSuccess',
  failed: 'loginResultFailed',
};

function SettingToggle({ checked, onChange, label, description }) {
  return (
    <div className="setting-toggle-row">
      <div><strong>{label}</strong><span>{description}</span></div>
      <button className={`setting-switch ${checked ? 'is-on' : ''}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en' : 'ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SecurityFormNotice({ error, notice }) {
  if (!error && !notice) return null;
  return <p className={`workspace-form-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <Icon name="warning" size={16} /> : <Icon name="check" size={16} />}{error || notice}</p>;
}

function LanguageFlag({ flag }) {
  if (flag === 'ru') {
    return <svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#fff" d="M0 0h30v6.67H0z" /><path fill="#1f57a6" d="M0 6.67h30v6.66H0z" /><path fill="#d9444c" d="M0 13.33h30V20H0z" /></svg>;
  }

  return <svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#012169" d="M0 0h30v20H0z" /><path stroke="#fff" strokeWidth="4" d="m0 0 30 20M30 0 0 20" /><path stroke="#c8102e" strokeWidth="2" d="m0 0 30 20M30 0 0 20" /><path stroke="#fff" strokeWidth="5" d="M15 0v20M0 10h30" /><path stroke="#c8102e" strokeWidth="3" d="M15 0v20M0 10h30" /></svg>;
}

export function SettingsPanel({ accessToken, currentUser, onCurrentUserUpdated, onLogout, preferences, updatePreferences, t }) {
  const [activeTab, setActiveTab] = useState('appearance');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [devices, setDevices] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);
  const [securityLoadError, setSecurityLoadError] = useState('');
  const [revokingDeviceId, setRevokingDeviceId] = useState('');
  const [pinForm, setPinForm] = useState({ currentPassword: '', pin: '' });
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordConfirmation, setPasswordConfirmation] = useState(null);
  const [passwordCode, setPasswordCode] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [emailForm, setEmailForm] = useState({ currentPassword: '', email: '' });
  const [emailConfirmation, setEmailConfirmation] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('loading');
  const density = preferences.density ?? 'comfortable';
  const currentDeviceId = getDeviceId();
  const activeDevices = devices.filter((device) => !device.revoked_at);

  const loadSecurityData = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingSecurity(true);
    setSecurityLoadError('');
    try {
      const [deviceItems, historyItems] = await Promise.all([
        getDevices(accessToken),
        getLoginHistory(accessToken),
      ]);
      setDevices(Array.isArray(deviceItems) ? deviceItems : []);
      setLoginHistory(Array.isArray(historyItems) ? historyItems : []);
    } catch (requestError) {
      setSecurityLoadError(requestError.message);
    } finally {
      setIsLoadingSecurity(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'security') void loadSecurityData();
  }, [activeTab, loadSecurityData]);

  useEffect(() => {
    if (activeTab !== 'notifications') return;
    notificationPermissionStatus()
      .then(setNotificationPermission)
      .catch(() => setNotificationPermission('unavailable'));
  }, [activeTab]);

  function saveLocalSettings() {
    setFormError('');
    setNotice(t('workspace.settingsPanel.saved'));
  }

  async function changeDesktopNotifications(enabled) {
    setFormError('');
    setNotice('');
    if (!enabled) {
      updatePreferences({ desktopNotifications: false });
      return;
    }

    const permission = await requestDesktopNotificationPermission().catch(() => 'denied');
    setNotificationPermission(permission);
    if (permission !== 'granted') {
      setFormError(t(permission === 'unavailable'
        ? 'workspace.settingsPanel.notificationUnavailable'
        : 'workspace.settingsPanel.notificationDenied'));
      return;
    }
    updatePreferences({ desktopNotifications: true });
    setNotice(t('workspace.settingsPanel.notificationEnabled'));
  }

  async function handleRevokeDevice(device) {
    if (revokingDeviceId || !window.confirm(t('workspace.settingsPanel.revokeDeviceConfirm', { device: device.device_id }))) return;
    setFormError('');
    setNotice('');
    setRevokingDeviceId(device.device_id);
    try {
      await revokeDevice(accessToken, device.device_id);
      if (device.device_id === currentDeviceId) {
        await onLogout?.();
        return;
      }
      setNotice(t('workspace.settingsPanel.deviceRevoked'));
      await loadSecurityData();
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setRevokingDeviceId('');
    }
  }

  async function handleSavePin(event) {
    event.preventDefault();
    if (isSavingPin) return;
    setFormError('');
    setNotice('');
    setIsSavingPin(true);
    try {
      await createPin(accessToken, {
        current_password: pinForm.currentPassword,
        pin: pinForm.pin,
        device_id: currentDeviceId,
      });
      setPinForm({ currentPassword: '', pin: '' });
      setNotice(t('workspace.settingsPanel.pinSaved'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsSavingPin(false);
    }
  }

  async function handleRemovePin() {
    if (!pinForm.currentPassword || isSavingPin) return;
    setFormError('');
    setNotice('');
    setIsSavingPin(true);
    try {
      await resetPin(accessToken, {
        current_password: pinForm.currentPassword,
        pin: null,
        device_id: currentDeviceId,
      });
      setPinForm({ currentPassword: '', pin: '' });
      setNotice(t('workspace.settingsPanel.pinRemoved'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsSavingPin(false);
    }
  }

  async function handleStartPasswordChange(event) {
    event.preventDefault();
    if (isChangingPassword) return;
    setFormError('');
    setNotice('');
    setIsChangingPassword(true);
    try {
      const confirmation = await startPasswordChange(accessToken, {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
        device_id: currentDeviceId,
        language: preferences.language,
      });
      setPasswordConfirmation(confirmation);
      setPasswordCode('');
      setNotice(t('workspace.settingsPanel.passwordConfirmationSent'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleConfirmPasswordChange(event) {
    event.preventDefault();
    if (!passwordConfirmation || passwordCode.length !== 6 || isChangingPassword) return;
    setFormError('');
    setNotice('');
    setIsChangingPassword(true);
    try {
      await confirmPasswordChange(accessToken, {
        verification_id: passwordConfirmation.verification_id,
        code: passwordCode,
        device_id: currentDeviceId,
      });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setPasswordConfirmation(null);
      setPasswordCode('');
      setNotice(t('workspace.settingsPanel.passwordChanged'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleStartEmailChange(event) {
    event.preventDefault();
    if (isChangingEmail) return;
    setFormError('');
    setNotice('');
    setIsChangingEmail(true);
    try {
      const confirmation = await startEmailChange(accessToken, {
        current_password: emailForm.currentPassword,
        email: emailForm.email,
        device_id: currentDeviceId,
        language: preferences.language,
      });
      setEmailConfirmation(confirmation);
      setEmailCode('');
      setNotice(t('workspace.settingsPanel.emailConfirmationSent'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsChangingEmail(false);
    }
  }

  async function handleConfirmEmailChange(event) {
    event.preventDefault();
    if (!emailConfirmation || emailCode.length !== 6 || isChangingEmail) return;
    setFormError('');
    setNotice('');
    setIsChangingEmail(true);
    try {
      const user = await confirmEmailChange(accessToken, {
        verification_id: emailConfirmation.verification_id,
        code: emailCode,
        device_id: currentDeviceId,
      });
      onCurrentUserUpdated?.(user);
      setEmailForm({ currentPassword: '', email: '' });
      setEmailConfirmation(null);
      setEmailCode('');
      setNotice(t('workspace.settingsPanel.emailChanged'));
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setIsChangingEmail(false);
    }
  }

  function handleTabKeyDown(event, currentIndex) {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(TABS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  const renderSettings = () => {
    if (activeTab === 'notifications') {
      return (
        <div className="settings-content">
          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.notificationsTitle')}</h2><p>{t('workspace.settingsPanel.notificationsText')}</p></div></div>
            <SettingToggle checked={preferences.desktopNotifications ?? true} onChange={changeDesktopNotifications} label={t('workspace.settingsPanel.desktopNotifications')} description={t('workspace.settingsPanel.desktopNotificationsText')} />
            <SettingToggle checked={preferences.messagePreview ?? true} onChange={(messagePreview) => updatePreferences({ messagePreview })} label={t('workspace.settingsPanel.messagePreview')} description={t('workspace.settingsPanel.messagePreviewText')} />
            <SettingToggle checked={preferences.soundEnabled} onChange={(soundEnabled) => updatePreferences({ soundEnabled })} label={t('workspace.settingsPanel.sound')} description={t('workspace.settingsPanel.soundText')} />
          </div>
          <div className="workspace-backend-note"><span aria-hidden="true" />{notificationPermission === 'granted' ? t('workspace.settingsPanel.notificationsReady') : t('workspace.settingsPanel.notificationsNotice')}</div>
        </div>
      );
    }

    if (activeTab === 'security') {
      return (
        <div className="settings-content">
          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.securityTitle')}</h2><p>{t('workspace.settingsPanel.securityText')}</p></div><span className="workspace-section-icon"><Icon name="shield" size={18} /></span></div>
            <div className="security-status"><span><Icon name="shield" size={18} /></span><div><strong>{currentUser?.profile?.email_verified ? t('workspace.settingsPanel.emailVerified') : t('workspace.settingsPanel.emailNeedsVerification')}</strong><p>{t('workspace.settingsPanel.securityStatusText', { count: activeDevices.length })}</p></div></div>
          </div>

          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.pinTitle')}</h2><p>{t('workspace.settingsPanel.pinText')}</p></div><span className="workspace-section-icon"><Icon name="key" size={18} /></span></div>
            <form className="security-form" onSubmit={handleSavePin}>
              <label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={pinForm.currentPassword} onChange={(event) => setPinForm((current) => ({ ...current, currentPassword: event.target.value }))} required minLength="5" maxLength="30" /></label>
              <label className="workspace-field"><span>{t('workspace.settingsPanel.pin')}</span><input type="password" inputMode="numeric" autoComplete="new-password" value={pinForm.pin} onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '') }))} required minLength="4" maxLength="8" /></label>
              <div className="security-form-actions"><button className="workspace-primary-button" type="submit" disabled={isSavingPin || !pinForm.currentPassword || pinForm.pin.length < 4}>{isSavingPin ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.savePin')}</button><button className="workspace-outline-button" type="button" disabled={isSavingPin || !pinForm.currentPassword} onClick={handleRemovePin}>{t('workspace.settingsPanel.removePin')}</button></div>
            </form>
          </div>

          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.changePasswordTitle')}</h2><p>{t('workspace.settingsPanel.passwordText')}</p></div><span className="workspace-section-icon"><Icon name="lock" size={18} /></span></div>
            <form className="security-form" onSubmit={passwordConfirmation ? handleConfirmPasswordChange : handleStartPasswordChange}>
              {!passwordConfirmation ? <><label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required minLength="5" maxLength="30" /></label><label className="workspace-field"><span>{t('workspace.settingsPanel.newPassword')}</span><input type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required minLength="5" maxLength="30" /></label><button className="workspace-primary-button" type="submit" disabled={isChangingPassword}>{isChangingPassword ? t('workspace.settingsPanel.sendingCode') : t('workspace.settingsPanel.sendCode')}</button></> : <><label className="workspace-field"><span>{t('workspace.settingsPanel.confirmationCode')}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" value={passwordCode} onChange={(event) => setPasswordCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="\d{6}" /></label><div className="security-form-actions"><button className="workspace-primary-button" type="submit" disabled={isChangingPassword || passwordCode.length !== 6}>{isChangingPassword ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.confirmPassword')}</button><button className="workspace-outline-button" type="button" disabled={isChangingPassword} onClick={() => { setPasswordConfirmation(null); setPasswordCode(''); }}>{t('common.cancel')}</button></div></>}
            </form>
          </div>

          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.emailChangeTitle')}</h2><p>{t('workspace.settingsPanel.emailText')}</p></div><span className="workspace-section-icon"><Icon name="mail" size={18} /></span></div>
            <form className="security-form" onSubmit={emailConfirmation ? handleConfirmEmailChange : handleStartEmailChange}>
              {!emailConfirmation ? <><label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={emailForm.currentPassword} onChange={(event) => setEmailForm((current) => ({ ...current, currentPassword: event.target.value }))} required minLength="5" maxLength="30" /></label><label className="workspace-field"><span>{t('workspace.settingsPanel.newEmail')}</span><input type="email" autoComplete="email" value={emailForm.email} onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))} required maxLength="255" /></label><button className="workspace-primary-button" type="submit" disabled={isChangingEmail}>{isChangingEmail ? t('workspace.settingsPanel.sendingCode') : t('workspace.settingsPanel.sendCode')}</button></> : <><label className="workspace-field"><span>{t('workspace.settingsPanel.confirmationCode')}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="\d{6}" /></label><div className="security-form-actions"><button className="workspace-primary-button" type="submit" disabled={isChangingEmail || emailCode.length !== 6}>{isChangingEmail ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.confirmEmail')}</button><button className="workspace-outline-button" type="button" disabled={isChangingEmail} onClick={() => { setEmailConfirmation(null); setEmailCode(''); }}>{t('common.cancel')}</button></div></>}
            </form>
          </div>

          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.devices')}</h2><p>{t('workspace.settingsPanel.devicesText')}</p></div><button className="workspace-icon-button" type="button" aria-label={t('workspace.settingsPanel.refreshSecurity')} onClick={() => loadSecurityData()} disabled={isLoadingSecurity}><Icon name="refresh" size={16} /></button></div>
            {isLoadingSecurity ? <p className="security-loading" role="status">{t('workspace.settingsPanel.loadingSecurity')}</p> : securityLoadError ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.settingsPanel.securityLoadError')}</strong><span>{securityLoadError}</span><button type="button" onClick={() => loadSecurityData()}>{t('workspace.retry')}</button></div> : <div className="security-device-list">{devices.length ? devices.map((device) => <article className="security-device-row" key={device.id}><span className="workspace-section-icon"><Icon name="device" size={17} /></span><div><strong>{device.device_id}</strong><span>{t('workspace.settingsPanel.deviceCreated', { date: formatDate(device.created_at) })}</span><small>{t('workspace.settingsPanel.deviceExpires', { date: formatDate(device.expires_at) })}</small></div>{device.revoked_at ? <em>{t('workspace.settingsPanel.revoked')}</em> : device.device_id === currentDeviceId ? <em className="is-current">{t('workspace.settingsPanel.currentDevice')}</em> : <button className="workspace-outline-button" type="button" disabled={revokingDeviceId === device.device_id} onClick={() => handleRevokeDevice(device)}>{revokingDeviceId === device.device_id ? t('workspace.settingsPanel.revoking') : t('workspace.settingsPanel.revoke')}</button>}</article>) : <p className="security-empty">{t('workspace.settingsPanel.noDevices')}</p>}</div>}
          </div>

          <div className="workspace-section-card">
            <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.loginHistory')}</h2><p>{t('workspace.settingsPanel.loginHistoryText')}</p></div></div>
            {isLoadingSecurity ? <p className="security-loading" role="status">{t('workspace.settingsPanel.loadingSecurity')}</p> : securityLoadError ? null : <div className="security-history-list">{loginHistory.length ? loginHistory.map((entry) => <article className="security-history-row" key={entry.id}><span className="workspace-section-icon"><Icon name={entry.result === 'success' ? 'check' : 'warning'} size={16} /></span><div><strong>{t(`workspace.settingsPanel.${LOGIN_METHODS[entry.method] || 'loginMethodOther'}`)}</strong><span>{entry.device_id || t('workspace.settingsPanel.unknownDevice')} · {formatDate(entry.created_at)}</span></div><em className={entry.result === 'success' ? 'is-success' : 'is-failed'}>{t(`workspace.settingsPanel.${LOGIN_RESULTS[entry.result] || 'loginResultOther'}`)}</em></article>) : <p className="security-empty">{t('workspace.settingsPanel.noLoginHistory')}</p>}</div>}
          </div>

          <button className="workspace-outline-button security-logout-button" type="button" onClick={() => onLogout?.()}><Icon name="logout" size={17} />{t('workspace.settingsPanel.logout')}</button>
        </div>
      );
    }

    return (
      <div className="settings-content">
        <div className="workspace-section-card">
          <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.appearanceTitle')}</h2><p>{t('workspace.settingsPanel.appearanceText')}</p></div></div>
          <div className="setting-control-block">
            <strong>{t('workspace.settingsPanel.theme')}</strong>
            <div className="theme-choice-grid">
              {['light', 'dark'].map((theme) => <button className={`theme-choice theme-choice-${theme} ${preferences.theme === theme ? 'is-selected' : ''}`} type="button" key={theme} aria-pressed={preferences.theme === theme} onClick={() => updatePreferences({ theme })}><span aria-hidden="true" /><b>{t(`common.${theme}`)}</b><i><Icon name="check" size={13} /></i></button>)}
            </div>
          </div>
          <fieldset className="setting-control-block language-choice-group">
            <legend>{t('workspace.settingsPanel.language')}</legend>
            <p id="language-choice-description">{t('workspace.settingsPanel.languageText')}</p>
            <div className="language-choice-list">
              {SUPPORTED_LANGUAGES.map((language) => {
                const isSelected = preferences.language === language.id;
                return (
                  <label className={`language-choice ${isSelected ? 'is-selected' : ''}`} key={language.id}>
                    <input type="radio" name="language" value={language.id} checked={isSelected} onChange={() => updatePreferences({ language: language.id })} aria-describedby="language-choice-description" />
                    <span className="language-choice-flag"><LanguageFlag flag={language.flag} /></span>
                    <span className="language-choice-copy"><strong>{language.label}</strong><small>{language.id.toUpperCase()}</small></span>
                    <span className="language-choice-state" aria-hidden="true"><Icon name="check" size={15} /></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <div className="workspace-section-card">
          <div className="workspace-section-heading"><div><h2>{t('workspace.settingsPanel.densityTitle')}</h2><p>{t('workspace.settingsPanel.densityText')}</p></div></div>
          <div className="density-choices">
            {['comfortable', 'compact'].map((value) => <button className={density === value ? 'is-selected' : ''} type="button" key={value} aria-pressed={density === value} onClick={() => updatePreferences({ density: value })}><span className={`density-preview density-preview-${value}`} aria-hidden="true"><i /><i /><i /></span><span><strong>{t(`workspace.settingsPanel.${value}`)}</strong><small>{t(`workspace.settingsPanel.${value}Text`)}</small></span><Icon name="check" size={17} /></button>)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="workspace-detail-panel workspace-settings-panel" aria-labelledby="settings-title">
      <header className="workspace-panel-heading">
        <div><p>{t('workspace.settingsPanel.kicker')}</p><h1 id="settings-title">{t('workspace.settingsPanel.title')}</h1><span>{t('workspace.settingsPanel.intro')}</span></div>
        <span className="workspace-panel-icon"><Icon name="settings" size={25} /></span>
      </header>
      <div className="settings-tabs" role="tablist" aria-label={t('workspace.settingsPanel.tabsLabel')}>
        {TABS.map((tab, index) => <button className={activeTab === tab.id ? 'is-active' : ''} type="button" role="tab" id={`settings-tab-${tab.id}`} aria-controls={`settings-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} key={tab.id} onClick={() => { setActiveTab(tab.id); setNotice(''); setFormError(''); }} onKeyDown={(event) => handleTabKeyDown(event, index)}><Icon name={tab.icon} size={16} />{t(`workspace.settingsPanel.${tab.id}`)}</button>)}
      </div>
      <div id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>{renderSettings()}</div>
      <SecurityFormNotice error={formError} notice={notice} />
      {activeTab !== 'security' ? <button className="workspace-primary-button" type="button" onClick={saveLocalSettings}><Icon name="save" size={17} />{t('workspace.settingsPanel.save')}</button> : null}
    </section>
  );
}
