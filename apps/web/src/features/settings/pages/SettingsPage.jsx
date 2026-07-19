import { useEffect, useState } from 'react';

import { LanguageSwitcher } from '../../../shared/ui/LanguageSwitcher.jsx';
import { ThemeSwitcher } from '../../../shared/ui/ThemeSwitcher.jsx';
import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useNotifications } from '../../../app/providers/NotificationsProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { useTheme } from '../../../app/providers/ThemeProvider.jsx';
import { getDeviceId } from '../../../shared/device/deviceId.js';
import { createPin, deleteAccount, resetPin } from '../../auth/api/authApi.js';
import { updateMyProfile } from '../../profile/api/userApi.js';
import { getDevices, getLoginHistory, revokeDevice } from '../api/deviceApi.js';

function isApplePlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /iPhone|iPad|iPod|Macintosh/i.test(userAgent);
}

export function SettingsPage() {
  const { t } = useI18n();
  const { session, saveSession, clearSession } = useSession();
  const { theme, setTheme } = useTheme();
  const [devices, setDevices] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState('error');
  const [showLiquidGlassPrompt, setShowLiquidGlassPrompt] = useState(false);
  const { disableNotifications, enableNotifications, isEnabled: notificationsEnabled, isSupported, permission: notificationPermission, pushConfigured } = useNotifications();
  const [activeTab, setActiveTab] = useState('appearance');
  const [pinForm, setPinForm] = useState({ current_password: '', pin: '' });
  const settingsTabs = [
    { id: 'appearance', icon: '🎨', label: t('settings.appearance') },
    { id: 'notifications', icon: '🔔', label: t('settings.notifications') },
    { id: 'security', icon: '🔐', label: t('settings.security') },
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
      setStatusKind('error');
      setStatus(err.message);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    const dismissed = localStorage.getItem('nexus_liquid_glass_prompt_dismissed') === 'true';
    setShowLiquidGlassPrompt(isApplePlatform() && theme !== 'liquid_glass' && !dismissed);
  }, [theme]);

  async function handleRevokeDevice(deviceId) {
    await revokeDevice(session.accessToken, deviceId);
    await loadSecurityData();
  }

  async function saveAppearancePreference(payload) {
    setStatus('');
    try {
      const user = await updateMyProfile(session.accessToken, payload);
      saveSession({ ...session, user });
      setStatusKind('success');
      setStatus(t('settings.saved'));
    } catch (err) {
      setStatusKind('error');
      setStatus(err.message);
    }
  }

  async function enableLiquidGlass() {
    setTheme('liquid_glass');
    localStorage.setItem('nexus_liquid_glass_prompt_dismissed', 'true');
    setShowLiquidGlassPrompt(false);
    await saveAppearancePreference({ design_theme: 'liquid_glass' });
  }

  function dismissLiquidGlassPrompt() {
    localStorage.setItem('nexus_liquid_glass_prompt_dismissed', 'true');
    setShowLiquidGlassPrompt(false);
  }

  async function handleEnableNotifications() {
    if (!isSupported) {
      setStatusKind('error');
      const result = await enableNotifications();
      setStatus(result.status === 'ios_install_required'
        ? t('settings.notificationsInstallRequired')
        : result.status === 'insecure_context'
          ? t('settings.notificationsHttpsRequired')
          : t('settings.notificationsUnsupported'));
      return;
    }

    const result = await enableNotifications();
    if (result.status === 'granted') {
      setStatusKind('success');
      setStatus(t('settings.notificationsEnabled'));
      return;
    }
    setStatusKind('error');
    setStatus(result.status === 'denied'
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
                : t('settings.notificationsNotEnabled'));
  }

  async function handleDisableNotifications() {
    await disableNotifications();
    setStatusKind('success');
    setStatus(t('settings.notificationsDisabled'));
  }

  async function handleCreatePin(event) {
    event.preventDefault();
    setStatus('');
    try {
      await createPin(session.accessToken, {
        current_password: pinForm.current_password,
        pin: pinForm.pin,
        device_id: getDeviceId(),
      });
      setPinForm({ current_password: '', pin: '' });
      setStatusKind('success');
      setStatus(t('settings.pinSaved'));
    } catch (err) {
      setStatusKind('error');
      setStatus(err.message);
    }
  }

  async function handleRemovePin() {
    setStatus('');
    try {
      await resetPin(session.accessToken, {
        current_password: pinForm.current_password,
        pin: null,
        device_id: getDeviceId(),
      });
      setPinForm({ current_password: '', pin: '' });
      setStatusKind('success');
      setStatus(t('settings.pinRemoved'));
    } catch (err) {
      setStatusKind('error');
      setStatus(err.message);
    }
  }

  async function handleDeleteAccount() {
    setStatus('');
    if (!window.confirm(t('settings.deleteAccountConfirm'))) return;
    try {
      await disableNotifications().catch(() => undefined);
      await deleteAccount(session.accessToken);
      clearSession();
    } catch (err) {
      setStatusKind('error');
      setStatus(err.message);
    }
  }

  return (
    <section className="panel readable">
      <h1>{t('settings.title')}</h1>
      <div className="settings-tabs" role="tablist" aria-label={t('settings.title')}>
        {settingsTabs.map((tab) => (
          <button
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      {status ? <p className={statusKind === 'success' ? 'success-text settings-status-line' : 'error-text settings-status-line'}>{status}</p> : null}
      {activeTab === 'appearance' ? (
        <section className="settings-section" role="tabpanel">
          <h2>{t('settings.appearance')}</h2>
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
            <ThemeSwitcher onChange={(designTheme) => saveAppearancePreference({ design_theme: designTheme })} />
          </label>
          <label className="field inline-field">
            <span>{t('settings.language')}</span>
            <LanguageSwitcher onChange={(language) => saveAppearancePreference({ language })} />
          </label>
        </section>
      ) : null}
      {activeTab === 'notifications' ? (
        <section className="settings-section" role="tabpanel">
          <h2>{t('settings.notifications')}</h2>
          <p className="muted">{t('settings.notificationsText')}</p>
          <div className="notification-settings-row">
            <span className={`settings-status-pill ${notificationsEnabled && notificationPermission === 'granted' ? 'granted' : notificationPermission === 'denied' || notificationPermission === 'unsupported' ? notificationPermission : 'default'}`}>
              {notificationsEnabled && notificationPermission === 'granted'
                ? t('settings.notificationStatus.granted')
                : t(`settings.notificationStatus.${notificationPermission === 'denied' || notificationPermission === 'unsupported' ? notificationPermission : 'default'}`)}
            </span>
            {notificationsEnabled ? (
              <button className="button button-secondary" type="button" onClick={handleDisableNotifications}>{t('settings.disableNotifications')}</button>
            ) : (
              <button className="button button-primary" type="button" onClick={handleEnableNotifications} disabled={notificationPermission === 'denied'}>
                {t('settings.enableNotifications')}
              </button>
            )}
          </div>
        </section>
      ) : null}
      {activeTab === 'security' ? (
        <section className="settings-section" role="tabpanel">
          <h2>{t('settings.security')}</h2>
          <h3>{t('settings.activeDevices')}</h3>
          <div className="list-stack">
            {devices.map((device) => (
              <article className="info-card" key={device.id}>
                <strong>{device.device_id}</strong>
                <span className="muted">{t('settings.until')} {new Date(device.expires_at).toLocaleString()}</span>
                {device.revoked_at ? <span className="muted">{t('settings.revoked')}</span> : <button className="button button-secondary" type="button" onClick={() => handleRevokeDevice(device.device_id)}>{t('settings.revoke')}</button>}
              </article>
            ))}
          </div>
          <h3>{t('settings.loginHistory')}</h3>
          <div className="list-stack">
            {history.map((item) => (
              <article className="info-card" key={item.id}>
                <strong>{item.method} — {item.result}</strong>
                <span className="muted">{new Date(item.created_at).toLocaleString()}</span>
              </article>
            ))}
          </div>
          <form className="info-card" onSubmit={handleCreatePin}>
            <h3>{t('settings.devicePinTitle')}</h3>
            <p className="muted">{t('settings.devicePinText')}</p>
            <input className="text-input" type="password" placeholder={t('settings.currentPassword')} value={pinForm.current_password} onChange={(event) => setPinForm((current) => ({ ...current, current_password: event.target.value }))} required />
            <input className="text-input" inputMode="numeric" placeholder={t('settings.newPin')} value={pinForm.pin} onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value }))} required />
            <button className="button button-secondary" type="submit">{t('settings.savePin')}</button>
            <button className="button button-secondary" type="button" onClick={handleRemovePin} disabled={!pinForm.current_password}>{t('settings.removePin')}</button>
          </form>
          <section className="info-card danger-zone">
            <h3>{t('settings.dangerZone')}</h3>
            <p className="muted">{t('settings.deleteAccountText')}</p>
            <button className="button button-danger" type="button" onClick={handleDeleteAccount}>{t('settings.deleteAccount')}</button>
          </section>
        </section>
      ) : null}
    </section>
  );
}
