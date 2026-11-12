import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@jm/ui';
import { ShieldAlert } from 'lucide-react';
import styles from './Unauthorized.module.css';

export const Unauthorized = () => {
  const navigate = useNavigate();
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}><ShieldAlert size={48} /></div>
        <h1 className={styles.title}>Acceso Denegado</h1>
        <p className={styles.text}>Tu rol asignado no cuenta con los permisos requeridos para acceder a esta sección de administración.</p>
        {/* un botón (no un <button> dentro de un <a>: control interactivo anidado) */}
        <Button variant="primary" onClick={() => navigate('/')}>Volver al Inicio</Button>
      </div>
    </div>
  );
};

export default Unauthorized;
