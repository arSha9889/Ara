import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { useAppFeedback } from '../../app/providers/AppFeedbackProvider.jsx';
import { Icon } from './Icon.jsx';

const DEFAULT_ICONS = {
  success: 'check',
  error: 'x',
  info: 'sparkles',
};

export function AppFeedbackViewport({ className = '' }) {
  const { t } = useI18n();
  const { items, dismiss } = useAppFeedback();

  if (!items.length) return null;

  return (
    <aside className={`app-feedback-viewport ${className}`.trim()} aria-label={t('feedback.title')}>
      {items.map((item) => (
        <article className={`app-feedback-card ${item.kind}`} key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} aria-live={item.kind === 'error' ? 'assertive' : 'polite'}>
          <span className="app-feedback-icon" aria-hidden="true"><Icon name={item.icon || DEFAULT_ICONS[item.kind]} size={19} /></span>
          <div className="app-feedback-copy">
            <strong>{item.title}</strong>
            {item.message ? <p>{item.message}</p> : null}
            {item.action ? (
              <button className="app-feedback-action" type="button" onClick={() => item.action.onClick()}>{item.action.label}</button>
            ) : null}
          </div>
          <button className="app-feedback-close" type="button" onClick={() => dismiss(item.id)} aria-label={t('common.close')}>
            <Icon name="x" size={16} />
          </button>
        </article>
      ))}
    </aside>
  );
}
