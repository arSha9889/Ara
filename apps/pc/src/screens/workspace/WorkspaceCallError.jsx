import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

export function WorkspaceCallError({ message, onClose, t }) {
  return (
    <div className="desktop-call-error" role="alert">
      <Icon name="warning" size={18} />
      <span>{message}</span>
      <AraButton aria-label={t('common.close')} onClick={onClose} size="icon" variant="ghost"><Icon name="close" size={15} /></AraButton>
    </div>
  );
}
