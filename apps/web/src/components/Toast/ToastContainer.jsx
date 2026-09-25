import React from 'react';
import { useUiStore } from '../../store/uiStore.js';
import styles from './ToastContainer.module.css';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export const ToastContainer = () => {
  const { toasts, removeToast } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        return (
          <div
            key={toast.id}
            className={[
              styles.toast,
              isSuccess ? styles.success : isError ? styles.error : styles.info
            ].join(' ')}
          >
            <span className={styles.icon}>
              {isSuccess && <CheckCircle size={18} />}
              {isError && <AlertCircle size={18} />}
              {!isSuccess && !isError && <Info size={18} />}
            </span>
            <span className={styles.message}>{toast.message}</span>
            <button className={styles.closeBtn} onClick={() => removeToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
