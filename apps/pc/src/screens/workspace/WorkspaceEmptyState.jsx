import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

export function WorkspaceEmptyState({ onNewChat, t }) {
  return (
    <section className="workspace-empty-state" aria-labelledby="workspace-empty-title">
      <h1 id="workspace-empty-title">{t('workspace.emptyTitle')}</h1>
      <span>{t('workspace.emptyText')}</span>
      <AraButton className="workspace-empty-action" onClick={onNewChat} variant="primary"><Icon name="plus" size={16} />{t('workspace.findUser')}</AraButton>
    </section>
  );
}
