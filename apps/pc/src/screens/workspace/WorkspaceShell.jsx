import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

export function WorkspaceShell({ chatList, children, details, density, isChatOpen, isStandalonePage, navigation, overlay, t }) {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    let isActive = true;

    void Promise.resolve()
      .then(() => getVersion())
      .then((version) => {
        if (isActive) setAppVersion(version);
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className={`workspace-screen ara-workspace-shell density-${density} ${isStandalonePage ? 'is-standalone-page' : ''} ${details ? 'has-chat-details' : ''}`}>
      {navigation}
      {isStandalonePage ? null : chatList}
      <section className={`workspace-main ara-workspace-main ${isChatOpen ? 'is-chat-open' : ''}`}>
        {children}
      </section>
      {details}
      {overlay}
      {appVersion ? <span aria-label={t('workspace.desktopVersion', { version: appVersion })} className="workspace-app-version">v{appVersion}</span> : null}
    </main>
  );
}
