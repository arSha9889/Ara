import { AraButton } from './AraButton.jsx';
import { WorkspaceIcon as Icon } from './WorkspaceIcon.jsx';

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

export function WorkspaceLoading({ children, className = '' }) {
  return <p className={classNames('workspace-state', 'workspace-state--loading', className)} role="status">{children}</p>;
}

export function WorkspaceError({ actionLabel, children, className = '', onAction, title }) {
  return (
    <div className={classNames('workspace-state', 'workspace-state--error', className)} role="alert">
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
      {onAction && actionLabel ? <AraButton onClick={onAction} size="compact" variant="primary">{actionLabel}</AraButton> : null}
    </div>
  );
}

export function WorkspaceEmpty({ action = null, children, className = '', title }) {
  return (
    <div className={classNames('workspace-state', 'workspace-state--empty', className)}>
      {title ? <strong>{title}</strong> : null}
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function WorkspaceNotice({ children, className = '', id, tone = 'success' }) {
  const isError = tone === 'error';
  return (
    <p id={id} className={classNames('workspace-notice', `workspace-notice--${tone}`, className)} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
      <Icon name={isError ? 'warning' : 'check'} size={16} />
      <span>{children}</span>
    </p>
  );
}
