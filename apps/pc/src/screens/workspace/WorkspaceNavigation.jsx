import { useEffect, useRef, useState } from 'react';

import { BrandMark } from '../../components/BrandMark.jsx';
import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

const PRIMARY_NAVIGATION_ITEMS = [
  { id: 'chats', icon: 'chats' },
  { id: 'groups', icon: 'groups' },
  { id: 'channels', icon: 'channels' },
  { id: 'calls', icon: 'calls' },
  { id: 'contacts', icon: 'contacts' },
];

const SECONDARY_NAVIGATION_ITEMS = [
  { id: 'profile', icon: 'profile' },
  { id: 'notifications', icon: 'bell' },
  { id: 'settings', icon: 'settings' },
];

function NavigationGroup({ activeSection, items, onSelect, t }) {
  return items.map((item) => {
    const isActive = activeSection === item.id;
    const label = item.id === 'channels' ? t('workspace.channels.title') : item.id === 'groups' ? t('workspace.groups.title') : t(`workspace.${item.id}`);
    return (
      <AraButton
        aria-current={isActive ? 'page' : undefined}
        className={`workspace-nav-menu-item ${isActive ? 'is-active' : ''}`}
        key={item.id}
        onClick={() => onSelect(item.id)}
        variant="ghost"
      >
        <Icon name={item.icon} />
        <span>{label}</span>
      </AraButton>
    );
  });
}

export function WorkspaceNavigation({ activeSection, currentUser, onHome, onSelect, t }) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const focusFirstDrawerControl = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector('button:not([disabled])')?.focus();
    });

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableControls = [...(drawerRef.current?.querySelectorAll('button:not([disabled])') ?? [])];
      const firstControl = focusableControls[0];
      const lastControl = focusableControls.at(-1);

      if (!firstControl || !lastControl) return;
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault();
        firstControl.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstDrawerControl);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function selectSection(section) {
    onSelect(section);
    setIsOpen(false);
  }

  return (
    <aside className="workspace-nav ara-workspace-navigation" aria-label={t('workspace.navigation')}>
      <AraButton className="workspace-logo" onClick={onHome} variant="surface" aria-label={t('window.appName')}>
        <BrandMark />
      </AraButton>
      <div className="workspace-nav-actions">
        <AraButton
          ref={triggerRef}
          aria-controls="workspace-navigation-drawer"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={t('workspace.navigation')}
          className={`workspace-nav-menu-trigger ${isOpen ? 'is-open' : ''}`}
          onClick={() => setIsOpen((current) => !current)}
          title={t('workspace.navigation')}
          variant="surface"
        >
          <Icon name="menu" size={20} />
        </AraButton>
        {isOpen ? <>
          <div aria-hidden="true" className="workspace-nav-drawer-backdrop" onMouseDown={() => setIsOpen(false)} />
          <aside className="workspace-nav-drawer" aria-label={t('workspace.navigation')} aria-modal="true" id="workspace-navigation-drawer" ref={drawerRef} role="dialog">
            <header className="workspace-nav-drawer-header">
              <h2>{t('workspace.navigation')}</h2>
              <AraButton aria-label={t('common.close')} className="workspace-nav-drawer-close" onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }} title={t('common.close')} variant="ghost">
                <Icon name="close" size={18} />
              </AraButton>
            </header>
            <nav className="workspace-nav-drawer-menu" aria-label={t('workspace.navigation')}>
              <div className="workspace-nav-menu-group">
                <NavigationGroup activeSection={activeSection} items={PRIMARY_NAVIGATION_ITEMS} onSelect={selectSection} t={t} />
              </div>
              <div className="workspace-nav-menu-separator" />
              <div className="workspace-nav-menu-group">
                <NavigationGroup activeSection={activeSection} items={SECONDARY_NAVIGATION_ITEMS} onSelect={selectSection} t={t} />
              </div>
            </nav>
          </aside>
        </> : null}
      </div>
    </aside>
  );
}
