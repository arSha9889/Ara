import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { WorkspaceNotice } from '../../components/WorkspaceState.jsx';
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
import {
  checkDesktopUpdate,
  desktopUpdaterIsAvailable,
  downloadDesktopUpdate,
  relaunchDesktop,
} from '../../features/updates/desktopUpdater.js';
import { AboutSettings } from './settings/AboutSettings.jsx';
import { AppearanceSettings } from './settings/AppearanceSettings.jsx';
import { NotificationSettings } from './settings/NotificationSettings.jsx';
import { SecuritySettings } from './settings/SecuritySettings.jsx';

const TABS = [
  { id: 'appearance', icon: 'palette' },
  { id: 'notifications', icon: 'bell' },
  { id: 'security', icon: 'shield' },
  { id: 'about', icon: 'info' },
];

const COMPACT_SETTINGS_NAVIGATION_QUERY = '(max-width: 1060px)';
const INITIAL_UPDATE_STATE = Object.freeze({ phase: 'idle', progress: null, update: null });

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
  const [appVersion, setAppVersion] = useState('');
  const [isLoadingAppVersion, setIsLoadingAppVersion] = useState(false);
  const [desktopUpdateState, setDesktopUpdateState] = useState(INITIAL_UPDATE_STATE);
  const nativeUpdateRef = useRef(null);
  const [isCompactSettingsNavigation, setIsCompactSettingsNavigation] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(COMPACT_SETTINGS_NAVIGATION_QUERY).matches
  ));
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

  useEffect(() => {
    if (activeTab !== 'about') return undefined;

    let isActive = true;
    setIsLoadingAppVersion(true);
    setAppVersion('');
    void Promise.resolve()
      .then(() => getVersion())
      .then((version) => {
        if (isActive) setAppVersion(version);
      })
      .catch(() => {
        if (isActive) setAppVersion('');
      })
      .finally(() => {
        if (isActive) setIsLoadingAppVersion(false);
      });

    return () => {
      isActive = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'about' || desktopUpdateState.phase !== 'idle' || desktopUpdaterIsAvailable()) return;
    setDesktopUpdateState({ phase: 'unavailable', progress: null, update: null });
  }, [activeTab, desktopUpdateState.phase]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_SETTINGS_NAVIGATION_QUERY);
    const updateLayout = () => setIsCompactSettingsNavigation(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  function updateLocalPreferences(nextPreferences) {
    if (Object.entries(nextPreferences).every(([key, value]) => preferences[key] === value)) return;
    updatePreferences(nextPreferences);
    setFormError('');
    setNotice({ key: 'workspace.settingsPanel.saved' });
  }

  async function handleCheckForDesktopUpdate() {
    if (desktopUpdateState.phase === 'checking' || desktopUpdateState.phase === 'downloading') return;

    nativeUpdateRef.current = null;
    setDesktopUpdateState({ phase: 'checking', progress: null, update: null });
    try {
      const result = await checkDesktopUpdate();
      if (result.status === 'available') {
        nativeUpdateRef.current = result.nativeUpdate;
        setDesktopUpdateState({ phase: 'available', progress: null, update: result.update });
        return;
      }
      setDesktopUpdateState({ phase: result.status, progress: null, update: null });
    } catch {
      setDesktopUpdateState({ phase: 'error', progress: null, update: null });
    }
  }

  async function handleDownloadDesktopUpdate() {
    const nativeUpdate = nativeUpdateRef.current;
    if (!nativeUpdate || desktopUpdateState.phase !== 'available') return;

    const update = desktopUpdateState.update;
    setDesktopUpdateState({ phase: 'downloading', progress: 0, update });
    try {
      await downloadDesktopUpdate(nativeUpdate, (progress) => {
        setDesktopUpdateState({ phase: 'downloading', progress: progress.percent, update });
      });
      setDesktopUpdateState({ phase: 'ready', progress: 100, update });
    } catch {
      nativeUpdateRef.current = null;
      setDesktopUpdateState({ phase: 'error', progress: null, update: null });
    }
  }

  async function handleRestartAfterDesktopUpdate() {
    if (desktopUpdateState.phase !== 'ready') return;

    setDesktopUpdateState((currentState) => ({ ...currentState, phase: 'restarting' }));
    try {
      await relaunchDesktop();
    } catch {
      setDesktopUpdateState((currentState) => ({ ...currentState, phase: 'error', progress: null, update: null }));
    }
  }

  async function changeDesktopNotifications(enabled) {
    setFormError('');
    setNotice('');
    if (!enabled) {
      updateLocalPreferences({ desktopNotifications: false });
      return;
    }

    const permission = await requestDesktopNotificationPermission().catch(() => 'denied');
    setNotificationPermission(permission);
    if (permission !== 'granted') {
      updatePreferences({ desktopNotifications: false });
      setFormError(t(permission === 'unavailable'
        ? 'workspace.settingsPanel.notificationUnavailable'
        : 'workspace.settingsPanel.notificationDenied'));
      return;
    }
    updateLocalPreferences({ desktopNotifications: true });
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
    selectTab(TABS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  function selectTab(tabId) {
    setActiveTab(tabId);
    setNotice('');
    setFormError('');
  }

  const renderSettings = () => {
    if (activeTab === 'appearance') return <AppearanceSettings density={density} onPreferenceChange={updateLocalPreferences} preferences={preferences} t={t} />;
    if (activeTab === 'notifications') return <NotificationSettings notificationPermission={notificationPermission} onDesktopNotificationsChange={changeDesktopNotifications} onPreferenceChange={updateLocalPreferences} preferences={preferences} t={t} />;
    if (activeTab === 'about') return <AboutSettings
      appVersion={appVersion}
      isLoadingAppVersion={isLoadingAppVersion}
      onCheckForUpdate={() => void handleCheckForDesktopUpdate()}
      onDownloadUpdate={() => void handleDownloadDesktopUpdate()}
      onRestartAfterUpdate={() => void handleRestartAfterDesktopUpdate()}
      t={t}
      updateState={desktopUpdateState}
    />;

    return <SecuritySettings
      activeDevices={activeDevices}
      currentDeviceId={currentDeviceId}
      currentUser={currentUser}
      devices={devices}
      emailCode={emailCode}
      emailConfirmation={emailConfirmation}
      emailForm={emailForm}
      isChangingEmail={isChangingEmail}
      isChangingPassword={isChangingPassword}
      isLoadingSecurity={isLoadingSecurity}
      isSavingPin={isSavingPin}
      loginHistory={loginHistory}
      onCancelEmailChange={() => { setEmailConfirmation(null); setEmailCode(''); }}
      onCancelPasswordChange={() => { setPasswordConfirmation(null); setPasswordCode(''); }}
      onConfirmEmailChange={handleConfirmEmailChange}
      onConfirmPasswordChange={handleConfirmPasswordChange}
      onEmailCodeChange={setEmailCode}
      onEmailFormChange={setEmailForm}
      onLoadSecurityData={() => void loadSecurityData()}
      onLogout={() => onLogout?.()}
      onPasswordCodeChange={setPasswordCode}
      onPasswordFormChange={setPasswordForm}
      onPinFormChange={setPinForm}
      onRemovePin={handleRemovePin}
      onRevokeDevice={handleRevokeDevice}
      onSavePin={handleSavePin}
      onStartEmailChange={handleStartEmailChange}
      onStartPasswordChange={handleStartPasswordChange}
      passwordCode={passwordCode}
      passwordConfirmation={passwordConfirmation}
      passwordForm={passwordForm}
      pinForm={pinForm}
      revokingDeviceId={revokingDeviceId}
      securityLoadError={securityLoadError}
      t={t}
    />;
  };

  return (
    <section className="workspace-detail-panel workspace-settings-panel" aria-labelledby="settings-title">
      <header className="workspace-panel-heading">
        <div><h1 id="settings-title">{t('workspace.settingsPanel.title')}</h1><span>{t('workspace.settingsPanel.intro')}</span></div>
      </header>
      <div className="settings-layout">
        <div className="settings-tabs" role="tablist" aria-label={t('workspace.settingsPanel.tabsLabel')} aria-orientation={isCompactSettingsNavigation ? 'horizontal' : 'vertical'}>
          {TABS.map((tab, index) => <button className={activeTab === tab.id ? 'is-active' : ''} type="button" role="tab" id={`settings-tab-${tab.id}`} aria-controls={`settings-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} key={tab.id} onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}><Icon name={tab.icon} size={16} />{t(`workspace.settingsPanel.${tab.id}`)}</button>)}
        </div>
        <div className="settings-main">
          <div id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>{renderSettings()}</div>
          {formError ? <WorkspaceNotice tone="error">{formError}</WorkspaceNotice> : notice ? <WorkspaceNotice>{typeof notice === 'string' ? notice : t(notice.key)}</WorkspaceNotice> : null}
        </div>
      </div>
    </section>
  );
}
