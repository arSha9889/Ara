export function Notice({ children, tone = 'info', id }) {
  if (!children) return null;
  return <p className={`notice notice-${tone}`} id={id} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}
