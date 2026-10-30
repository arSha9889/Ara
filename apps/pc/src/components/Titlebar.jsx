import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { WorkspaceIcon as Icon } from './WorkspaceIcon.jsx';

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window;
}

export function Titlebar({ t }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = navigator.userAgent.includes('Macintosh');

  async function withWindow(action) {
    if (!isTauriRuntime()) return;
    const appWindow = getCurrentWindow();
    await action(appWindow);
  }

  async function toggleMaximize() {
    await withWindow(async (appWindow) => {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    });
  }

  const controls = (
    <div className="window-controls" aria-label={t('window.appName')}>
      <button className="window-control minimize" type="button" onClick={() => withWindow((appWindow) => appWindow.minimize())} aria-label={t('window.minimize')}>
        {isMac ? <span aria-hidden="true" /> : <Icon name="minus" size={14} />}
      </button>
      <button className="window-control maximize" type="button" onClick={toggleMaximize} aria-label={t(isMaximized ? 'window.restore' : 'window.maximize')}>
        {isMac ? <span aria-hidden="true" /> : <Icon name={isMaximized ? 'restore' : 'maximize'} size={14} />}
      </button>
      <button className="window-control close" type="button" onClick={() => withWindow((appWindow) => appWindow.close())} aria-label={t('window.close')}>
        {isMac ? <span aria-hidden="true" /> : <Icon name="close" size={14} />}
      </button>
    </div>
  );

  return (
    <header className={`titlebar ${isMac ? 'is-mac' : 'is-windows'}`}>
      {isMac ? controls : null}
      <span className="titlebar-drag-region" data-tauri-drag-region />
      {isMac ? <span className="titlebar-spacer" data-tauri-drag-region /> : controls}
    </header>
  );
}
