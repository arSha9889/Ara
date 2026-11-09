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
        aria-checked={isActive}
        aria-current={isActive ? 'page' : undefined}
        className={`workspace-nav-menu-item ${isActive ? 'is-active' : ''}`}
        key={item.id}
        onClick={() => onSelect(item.id)}
        role="menuitemradio"
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
  const navigationRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnOutsideInteraction(event) {
      if (!navigationRef.current?.contains(event.target)) setIsOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function selectSection(section) {
    onSelect(section);
    setIsOpen(false);
  }

  return (
    <aside className="workspace-nav ara-workspace-navigation" aria-label={t('workspace.navigation')} ref={navigationRef}>
      <AraButton className="workspace-logo" onClick={onHome} variant="surface" aria-label={t('window.appName')}>
        <BrandMark />
      </AraButton>
      <div className="workspace-nav-actions">
        <AraButton
          ref={triggerRef}
          aria-controls="workspace-navigation-menu"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={t('workspace.navigation')}
          className={`workspace-nav-menu-trigger ${isOpen ? 'is-open' : ''}`}
          onClick={() => setIsOpen((current) => !current)}
          title={t('workspace.navigation')}
          variant="surface"
        >
          <Icon name="menu" size={20} />
        </AraButton>
        {isOpen ? <nav className="workspace-nav-menu" id="workspace-navigation-menu" role="menu" aria-label={t('workspace.navigation')}>
          <div className="workspace-nav-menu-group" role="group">
            <NavigationGroup activeSection={activeSection} items={PRIMARY_NAVIGATION_ITEMS} onSelect={selectSection} t={t} />
          </div>
          <div className="workspace-nav-menu-separator" />
          <div className="workspace-nav-menu-group" role="group">
            <NavigationGroup activeSection={activeSection} items={SECONDARY_NAVIGATION_ITEMS} onSelect={selectSection} t={t} />
          </div>
        </nav> : null}
      </div>
    </aside>
  );
}
