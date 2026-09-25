import React from 'react';
import styles from './Input.module.css';

export const Input = ({
  label,
  type = 'text',
  error,
  helperText,
  disabled = false,
  className = '',
  leftIcon,
  rightIcon,
  id,
  ...props
}) => {
  const containerClass = [styles.container, className].join(' ');
  const inputClass = [
    styles.input,
    error ? styles.errorInput : '',
    leftIcon ? styles.hasLeftIcon : '',
    rightIcon ? styles.hasRightIcon : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
        <input id={id} type={type} className={inputClass} disabled={disabled} {...props} />
        {rightIcon && <span className={styles.rightIcon}>{rightIcon}</span>}
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
      {!error && helperText && <p className={styles.helperText}>{helperText}</p>}
    </div>
  );
};
export default Input;
