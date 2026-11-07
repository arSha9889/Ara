import { AraButton } from '../../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../../components/WorkspaceIcon.jsx';
import { WorkspaceEmpty, WorkspaceError, WorkspaceLoading } from '../../../components/WorkspaceState.jsx';

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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(document.documentElement.lang || 'ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function SecuritySection({ children, title, description, action = null }) {
  return (
    <section className="workspace-section-card">
      <div className="workspace-section-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>
      {children}
    </section>
  );
}

export function SecuritySettings({
  activeDevices,
  currentDeviceId,
  currentUser,
  devices,
  emailCode,
  emailConfirmation,
  emailForm,
  isChangingEmail,
  isChangingPassword,
  isLoadingSecurity,
  isSavingPin,
  loginHistory,
  onCancelEmailChange,
  onCancelPasswordChange,
  onConfirmEmailChange,
  onConfirmPasswordChange,
  onEmailCodeChange,
  onEmailFormChange,
  onLoadSecurityData,
  onLogout,
  onPasswordCodeChange,
  onPasswordFormChange,
  onPinFormChange,
  onRemovePin,
  onRevokeDevice,
  onSavePin,
  onStartEmailChange,
  onStartPasswordChange,
  passwordCode,
  passwordConfirmation,
  passwordForm,
  pinForm,
  revokingDeviceId,
  securityLoadError,
  t,
}) {
  const loading = <WorkspaceLoading>{t('workspace.settingsPanel.loadingSecurity')}</WorkspaceLoading>;
  const error = securityLoadError ? <WorkspaceError actionLabel={t('workspace.retry')} onAction={onLoadSecurityData} title={t('workspace.settingsPanel.securityLoadError')}>{securityLoadError}</WorkspaceError> : null;

  return (
    <div className="settings-content">
      <SecuritySection title={t('workspace.settingsPanel.securityTitle')} description={t('workspace.settingsPanel.securityText')}>
        <div className="security-status"><div><strong>{currentUser?.profile?.email_verified ? t('workspace.settingsPanel.emailVerified') : t('workspace.settingsPanel.emailNeedsVerification')}</strong><p>{t('workspace.settingsPanel.securityStatusText', { count: activeDevices.length })}</p></div></div>
      </SecuritySection>

      <SecuritySection title={t('workspace.settingsPanel.pinTitle')} description={t('workspace.settingsPanel.pinText')}>
        <form className="security-form" onSubmit={onSavePin}>
          <label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={pinForm.currentPassword} onChange={(event) => onPinFormChange({ ...pinForm, currentPassword: event.target.value })} required minLength="5" maxLength="30" /></label>
          <label className="workspace-field"><span>{t('workspace.settingsPanel.pin')}</span><input type="password" inputMode="numeric" autoComplete="new-password" value={pinForm.pin} onChange={(event) => onPinFormChange({ ...pinForm, pin: event.target.value.replace(/\D/g, '') })} required minLength="4" maxLength="8" /></label>
          <div className="security-form-actions"><AraButton type="submit" variant="primary" disabled={isSavingPin || !pinForm.currentPassword || pinForm.pin.length < 4}>{isSavingPin ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.savePin')}</AraButton><AraButton type="button" variant="secondary" disabled={isSavingPin || !pinForm.currentPassword} onClick={onRemovePin}>{t('workspace.settingsPanel.removePin')}</AraButton></div>
        </form>
      </SecuritySection>

      <SecuritySection title={t('workspace.settingsPanel.changePasswordTitle')} description={t('workspace.settingsPanel.passwordText')}>
        <form className="security-form" onSubmit={passwordConfirmation ? onConfirmPasswordChange : onStartPasswordChange}>
          {!passwordConfirmation ? <><label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => onPasswordFormChange({ ...passwordForm, currentPassword: event.target.value })} required minLength="5" maxLength="30" /></label><label className="workspace-field"><span>{t('workspace.settingsPanel.newPassword')}</span><input type="password" autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => onPasswordFormChange({ ...passwordForm, newPassword: event.target.value })} required minLength="5" maxLength="30" /></label><AraButton type="submit" variant="primary" disabled={isChangingPassword}>{isChangingPassword ? t('workspace.settingsPanel.sendingCode') : t('workspace.settingsPanel.sendCode')}</AraButton></> : <><label className="workspace-field"><span>{t('workspace.settingsPanel.confirmationCode')}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" value={passwordCode} onChange={(event) => onPasswordCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="\d{6}" /></label><div className="security-form-actions"><AraButton type="submit" variant="primary" disabled={isChangingPassword || passwordCode.length !== 6}>{isChangingPassword ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.confirmPassword')}</AraButton><AraButton type="button" variant="secondary" disabled={isChangingPassword} onClick={onCancelPasswordChange}>{t('common.cancel')}</AraButton></div></>}
        </form>
      </SecuritySection>

      <SecuritySection title={t('workspace.settingsPanel.emailChangeTitle')} description={t('workspace.settingsPanel.emailText')}>
        <form className="security-form" onSubmit={emailConfirmation ? onConfirmEmailChange : onStartEmailChange}>
          {!emailConfirmation ? <><label className="workspace-field"><span>{t('workspace.settingsPanel.currentPassword')}</span><input type="password" autoComplete="current-password" value={emailForm.currentPassword} onChange={(event) => onEmailFormChange({ ...emailForm, currentPassword: event.target.value })} required minLength="5" maxLength="30" /></label><label className="workspace-field"><span>{t('workspace.settingsPanel.newEmail')}</span><input type="email" autoComplete="email" value={emailForm.email} onChange={(event) => onEmailFormChange({ ...emailForm, email: event.target.value })} required maxLength="255" /></label><AraButton type="submit" variant="primary" disabled={isChangingEmail}>{isChangingEmail ? t('workspace.settingsPanel.sendingCode') : t('workspace.settingsPanel.sendCode')}</AraButton></> : <><label className="workspace-field"><span>{t('workspace.settingsPanel.confirmationCode')}</span><input type="text" inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(event) => onEmailCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="\d{6}" /></label><div className="security-form-actions"><AraButton type="submit" variant="primary" disabled={isChangingEmail || emailCode.length !== 6}>{isChangingEmail ? t('workspace.settingsPanel.saving') : t('workspace.settingsPanel.confirmEmail')}</AraButton><AraButton type="button" variant="secondary" disabled={isChangingEmail} onClick={onCancelEmailChange}>{t('common.cancel')}</AraButton></div></>}
        </form>
      </SecuritySection>

      <SecuritySection action={<AraButton type="button" aria-label={t('workspace.settingsPanel.refreshSecurity')} onClick={onLoadSecurityData} disabled={isLoadingSecurity} size="icon" variant="secondary"><Icon name="refresh" size={16} /></AraButton>} title={t('workspace.settingsPanel.devices')} description={t('workspace.settingsPanel.devicesText')}>
        {isLoadingSecurity ? loading : error || (devices.length ? <div className="security-device-list">{devices.map((device) => <article className="security-device-row" key={device.id}><div><strong>{device.device_id}</strong><span>{t('workspace.settingsPanel.deviceCreated', { date: formatDate(device.created_at) })}</span><small>{t('workspace.settingsPanel.deviceExpires', { date: formatDate(device.expires_at) })}</small></div>{device.revoked_at ? <em>{t('workspace.settingsPanel.revoked')}</em> : device.device_id === currentDeviceId ? <em className="is-current">{t('workspace.settingsPanel.currentDevice')}</em> : <AraButton type="button" variant="secondary" disabled={revokingDeviceId === device.device_id} onClick={() => onRevokeDevice(device)}>{revokingDeviceId === device.device_id ? t('workspace.settingsPanel.revoking') : t('workspace.settingsPanel.revoke')}</AraButton>}</article>)}</div> : <WorkspaceEmpty>{t('workspace.settingsPanel.noDevices')}</WorkspaceEmpty>)}
      </SecuritySection>

      <SecuritySection title={t('workspace.settingsPanel.loginHistory')} description={t('workspace.settingsPanel.loginHistoryText')}>
        {isLoadingSecurity ? loading : securityLoadError ? null : loginHistory.length ? <div className="security-history-list">{loginHistory.map((entry) => <article className="security-history-row" key={entry.id}><div><strong>{t(`workspace.settingsPanel.${LOGIN_METHODS[entry.method] || 'loginMethodOther'}`)}</strong><span>{entry.device_id || t('workspace.settingsPanel.unknownDevice')} · {formatDate(entry.created_at)}</span></div><em className={entry.result === 'success' ? 'is-success' : 'is-failed'}>{t(`workspace.settingsPanel.${LOGIN_RESULTS[entry.result] || 'loginResultOther'}`)}</em></article>)}</div> : <WorkspaceEmpty>{t('workspace.settingsPanel.noLoginHistory')}</WorkspaceEmpty>}
      </SecuritySection>

      <AraButton className="security-logout-button" type="button" variant="secondary" onClick={onLogout}><Icon name="logout" size={17} />{t('workspace.settingsPanel.logout')}</AraButton>
    </div>
  );
}
