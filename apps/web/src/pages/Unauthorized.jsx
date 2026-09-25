import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@jm/ui';
import { ShieldAlert } from 'lucide-react';
import styles from './Unauthorized.module.css';

export const Unauthorized = () => {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}><ShieldAlert size={48} /></div>
        <h1 className={styles.title}>Acceso Denegado</h1>
        <p className={styles.text}>Tu rol asignado no cuenta con los permisos requeridos para acceder a esta sección de administración.</p>
        <Link to="/">
          <Button variant="primary">Volver al Inicio</Button>
        </Link>
      </div>
    </div>
  );
};

export default Unauthorized;
