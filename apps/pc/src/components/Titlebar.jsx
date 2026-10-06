import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { BrandMark } from './BrandMark.jsx';

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
        <span aria-hidden="true" />
      </button>
      <button className="window-control maximize" type="button" onClick={toggleMaximize} aria-label={t(isMaximized ? 'window.restore' : 'window.maximize')}>
        <span aria-hidden="true" />
      </button>
      <button className="window-control close" type="button" onClick={() => withWindow((appWindow) => appWindow.close())} aria-label={t('window.close')}>
        <span aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <header className={`titlebar ${isMac ? 'is-mac' : 'is-windows'}`}>
      {isMac ? controls : <BrandMark compact />}
      <p className="titlebar-name" data-tauri-drag-region>AraChat</p>
      {isMac ? <span className="titlebar-spacer" data-tauri-drag-region /> : controls}
    </header>
  );
}
