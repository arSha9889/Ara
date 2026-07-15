export function EmptyState({ title, text, action }) {
  return (
    <section className="empty-state">
      <div className="empty-orbit" aria-hidden="true" />
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
      {action}
    </section>
  );
}
