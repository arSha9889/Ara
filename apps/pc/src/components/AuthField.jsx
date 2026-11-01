import { useState } from 'react';

import { WorkspaceIcon as Icon } from './WorkspaceIcon.jsx';

export function AuthField({ id, label, icon, className = '', children, ...inputProps }) {
  return (
    <div className={`auth-field ${className}`.trim()}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className="auth-input-shell">
        {icon ? <Icon name={icon} size={22} /> : null}
        <input id={id} {...inputProps} />
        {children}
      </div>
    </div>
  );
}

export function AuthPasswordField({ id, label, icon = 'lock', showLabel, hideLabel, children, ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <AuthField id={id} label={label} icon={icon} type={isVisible ? 'text' : 'password'} {...inputProps}>
      <button
        className="auth-password-toggle"
        type="button"
        aria-label={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
        disabled={inputProps.disabled}
        onClick={() => setIsVisible((current) => !current)}
      >
        <Icon name={isVisible ? 'eye-off' : 'eye'} size={20} />
      </button>
      {children}
    </AuthField>
  );
}
