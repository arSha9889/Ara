import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

function EmptyIllustration() {
  return (
    <div className="workspace-empty-illustration" aria-hidden="true">
      <span className="empty-orbit empty-orbit-one" />
      <span className="empty-orbit empty-orbit-two" />
      <svg viewBox="0 0 176 152" fill="none">
        <path d="M42 103.5c-11.6 0-21-8.8-21-19.7 0-7.5 4.4-14.1 10.9-17.5-1.2-2.5-1.9-5.3-1.9-8.2 0-11.1 9.7-20.1 21.6-20.1 4.5 0 8.7 1.3 12.2 3.6C68.3 29.1 80.6 20 95 20c17.9 0 32.5 14 32.5 31.2 0 1.8-.2 3.5-.5 5.2 10.4 1.2 18.5 9.5 18.5 19.5 0 10.9-9.6 19.8-21.4 19.8H42Z" className="empty-cloud" />
        <path d="M55 111.5h61M68 126.5h35" className="empty-line" />
        <path d="M82.5 45.5c0-8.5 6.7-15.5 15-15.5h7.5c10.8 0 19.5 8.7 19.5 19.5S115.8 69 105 69h-8l-10.8 8 .7-10.5a20 20 0 0 1-4.4-12.5Z" className="empty-bubble" />
        <circle cx="95" cy="49.5" r="2" className="empty-dot" />
        <circle cx="103" cy="49.5" r="2" className="empty-dot" />
        <circle cx="111" cy="49.5" r="2" className="empty-dot" />
      </svg>
      <span className="empty-feather empty-feather-one" />
      <span className="empty-feather empty-feather-two" />
    </div>
  );
}

export function WorkspaceEmptyState({ onNewChat, t }) {
  return (
    <section className="workspace-empty-state" aria-labelledby="workspace-empty-title">
      <EmptyIllustration />
      <p>{t('workspace.emptyKicker')}</p>
      <h1 id="workspace-empty-title">{t('workspace.emptyTitle')}</h1>
      <span>{t('workspace.emptyText')}</span>
      <AraButton className="workspace-empty-action" onClick={onNewChat} variant="primary"><Icon name="plus" size={16} />{t('workspace.findUser')}</AraButton>
    </section>
  );
}
