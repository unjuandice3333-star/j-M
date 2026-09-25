import React from 'react';
import { Badge, Table, TableRow, TableCell } from '@jm/ui';
import styles from './Inventory.module.css'; // Reutilizar el contenedor base limpio

export const Customers = () => {
  const customerList = [
    { name: 'María Camila Restrepo', documentId: '1017244589', email: 'camila@gmail.com', phone: '3124556789', points: 450, category: 'Platinum' },
    { name: 'Mateo Castro Castro', documentId: '80123456', email: 'mateo@outlook.com', phone: '3007654321', points: 180, category: 'Gold' },
    { name: 'Sofía Isabella Martínez', documentId: '1035987654', email: 'sofia.isabella@yahoo.com', phone: '3158882244', points: 30, category: 'Silver' },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Fidelización y Base de Datos de Clientes</h1>
      <p className={styles.subtitle}>Registro de compras acumuladas, wallets de puntos y categorías exclusivas.</p>

      <div className={styles.tableCard}>
        <Table headers={['Nombre Completo', 'Documento (Cédula)', 'Correo Electrónico', 'Celular', 'Wallet de Puntos', 'Categoría']}>
          {customerList.map((item, index) => (
            <TableRow key={index}>
              <TableCell style={{ fontWeight: 600 }}>{item.name}</TableCell>
              <TableCell style={{ fontFamily: 'monospace' }}>{item.documentId}</TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell>{item.phone}</TableCell>
              <TableCell style={{ fontWeight: 700, color: 'var(--success)' }}>{item.points} pts</TableCell>
              <TableCell>
                <Badge variant={item.category === 'Platinum' ? 'destructive' : item.category === 'Gold' ? 'warning' : 'secondary'}>
                  {item.category}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>
    </div>
  );
};

export default Customers;
