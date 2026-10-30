import { BrandMark } from '../../components/BrandMark.jsx';
import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

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
          aria-label={label}
          className={`workspace-nav-button ${isActive ? 'is-active' : ''}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
          title={label}
        variant={isActive ? 'active' : 'ghost'}
      >
        <Icon name={item.icon} />
        <span>{label}</span>
      </AraButton>
    );
  });
}

export function WorkspaceNavigation({ activeSection, currentUser, onHome, onSelect, t }) {
  const profile = currentUser?.profile;
  const displayName = profile?.display_name || profile?.username || t('workspace.profile');
  const avatarUrl = mediaUrlForDesktop(profile?.avatar_ref);

  return (
    <aside className="workspace-nav ara-workspace-navigation" aria-label={t('workspace.navigation')}>
      <AraButton className="workspace-logo" onClick={onHome} variant="surface" aria-label={t('window.appName')}>
        <BrandMark />
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
      <AraButton aria-current={activeSection === 'profile' ? 'page' : undefined} aria-label={t('workspace.profile')} className={`workspace-user-chip ${activeSection === 'profile' ? 'is-active' : ''}`} onClick={() => onSelect('profile')} title={t('workspace.profile')} variant="ghost">
        <span className="workspace-user-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}</span>
        <span><strong>{displayName}</strong><small>{t('workspace.chatInspector.online')}</small></span>
        <Icon name="chevron-right" size={15} />
      </AraButton>
    </aside>
  );
}
