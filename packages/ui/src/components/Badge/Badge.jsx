import React from 'react';
import styles from './Badge.module.css';

export const Badge = ({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'success' | 'warning' | 'destructive'
  className = '',
  ...props
}) => {
  const badgeClass = [styles.badge, styles[variant], className].join(' ');

  return (
    <span className={badgeClass} {...props}>
      {children}
    </span>
  );
};
export default Badge;
