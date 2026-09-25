import React from 'react';
import { Badge, Table, TableRow, TableCell } from '@jm/ui';
import styles from './Inventory.module.css';

export const Inventory = () => {
  const stockList = [
    { reference: 'CAM-OVS-NEGRA', name: 'Camiseta Oversize Heavyweight', size: 'S', color: 'Negro Premium', sku: 'CAM-OVS-NEG-S', barcode: '7701234567890', stock: 45, minStock: 10, price: '$90,000' },
    { reference: 'CAM-OVS-NEGRA', name: 'Camiseta Oversize Heavyweight', size: 'M', color: 'Negro Premium', sku: 'CAM-OVS-NEG-M', barcode: '7701234567891', stock: 68, minStock: 10, price: '$90,000' },
    { reference: 'JEAN-FIT-BEIGE', name: 'Jean Slim Fit Denim', size: '32', color: 'Beige Lino', sku: 'JEAN-FIT-BEI-32', barcode: '7709876543210', stock: 3, minStock: 5, price: '$160,000' },
    { reference: 'CHQ-BOM-GRIS', name: 'Chaqueta Bomber Premium', size: 'L', color: 'Gris Oxford', sku: 'CHQ-BOM-GRI-L', barcode: '7705556667770', stock: 14, minStock: 4, price: '$230,000' },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Motor de Inventario y Matriz de Variantes</h1>
      <p className={styles.subtitle}>Supervisión de prendas por combinación de diseño, talla y color.</p>

      <div className={styles.tableCard}>
        <Table headers={['Referencia', 'Nombre Prenda', 'Talla', 'Color', 'SKU', 'Código Barras', 'Stock', 'Precio']}>
          {stockList.map((item, index) => {
            const isLowStock = item.stock <= item.minStock;
            return (
              <TableRow key={index}>
                <TableCell style={{ fontWeight: 600 }}>{item.reference}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.size}</Badge>
                </TableCell>
                <TableCell>{item.color}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.sku}</TableCell>
                <TableCell style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.barcode}</TableCell>
                <TableCell>
                  <Badge variant={isLowStock ? 'destructive' : 'success'}>
                    {item.stock} unidades {isLowStock ? '(BAJO)' : ''}
                  </Badge>
                </TableCell>
                <TableCell style={{ fontWeight: 600 }}>{item.price}</TableCell>
              </TableRow>
            );
          })}
        </Table>
      </div>
    </div>
  );
};

export default Inventory;
