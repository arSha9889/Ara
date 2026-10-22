import { parrotIcon } from '../../components/BrandMark.jsx';
import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

const PRIMARY_NAVIGATION_ITEMS = [
  { id: 'chats', icon: 'chats' },
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
    return (
        <AraButton
          aria-current={isActive ? 'page' : undefined}
          aria-label={item.id === 'channels' ? t('workspace.channels.title') : t(`workspace.${item.id}`)}
          className={`workspace-nav-button ${isActive ? 'is-active' : ''}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          size="icon"
          title={item.id === 'channels' ? t('workspace.channels.title') : t(`workspace.${item.id}`)}
        variant={isActive ? 'active' : 'ghost'}
      >
        <Icon name={item.icon} />
      </AraButton>
    );
  });
}

export function WorkspaceNavigation({ activeSection, onHome, onSelect, t }) {
  return (
    <aside className="workspace-nav ara-workspace-navigation" aria-label={t('workspace.navigation')}>
      <AraButton className="workspace-logo" onClick={onHome} size="icon" variant="surface" aria-label={t('window.appName')}>
        <img src={parrotIcon} alt="" />
      </AraButton>
      <nav className="workspace-nav-groups">
        <div className="workspace-nav-group">
          <NavigationGroup activeSection={activeSection} items={PRIMARY_NAVIGATION_ITEMS} onSelect={onSelect} t={t} />
        </div>
        <div className="workspace-nav-separator" />
        <div className="workspace-nav-group workspace-nav-group-bottom">
          <NavigationGroup activeSection={activeSection} items={SECONDARY_NAVIGATION_ITEMS} onSelect={onSelect} t={t} />
        </div>
      </nav>
    </aside>
  );
}
