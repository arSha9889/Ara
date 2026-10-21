export function AraButton({
  children,
  className = '',
  size = 'regular',
  type = 'button',
  variant = 'secondary',
  ...props
}) {
  return (
    <button
      {...props}
      className={`ara-button ara-button--${variant} ara-button--${size} ${className}`.trim()}
      type={type}
    >
      {children}
    </button>
  );
}
