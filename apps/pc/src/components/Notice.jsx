export function Notice({ children, tone = 'info' }) {
  if (!children) return null;
  return <p className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}
