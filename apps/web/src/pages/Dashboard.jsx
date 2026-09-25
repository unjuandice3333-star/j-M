import React from 'react';
import { Badge, Table, TableRow, TableCell } from '@jm/ui';
import {
  TrendingUp,
  AlertTriangle,
  PackageX,
  Users2,
  DollarSign
} from 'lucide-react';
import styles from './Dashboard.module.css';

export const Dashboard = () => {
  const stats = [
    { label: 'Ventas del Día', value: '$2,450,000', icon: <TrendingUp size={24} />, trend: '+15.2% vs ayer', success: true },
    { label: 'Ganancia Estimada (Mes)', value: '$18,900,000', icon: <DollarSign size={24} />, trend: 'Margen 42% promedio', success: true },
    { label: 'Alertas Stock Bajo', value: '8 Variantes', icon: <AlertTriangle size={24} />, trend: 'Nivel menor al mínimo', success: false },
    { label: 'Inventario Estancado', value: '4 Referencias', icon: <PackageX size={24} />, trend: 'Sin rotación > 60 días', success: false },
  ];

  const bestSellers = [
    { reference: 'CAM-OVS-NEGRA', name: 'Camiseta Oversize Heavyweight', category: 'Superior', sold: 124, revenue: '$11,160,000' },
    { reference: 'JEAN-FIT-AZUL', name: 'Jean Slim Fit Denim', category: 'Inferior', sold: 82, revenue: '$13,120,000' },
    { reference: 'CHQ-BOM-BEIGE', name: 'Chaqueta Bomber Lino', category: 'Superior', sold: 45, revenue: '$10,350,000' },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Panel de Control Ejecutivo</h1>
      <p className={styles.subtitle}>Resumen analítico consolidado para J&M Fashion Retail.</p>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map((stat, idx) => (
          <div key={idx} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>{stat.label}</span>
              <span className={stat.success ? styles.cardIconSuccess : styles.cardIconWarning}>
                {stat.icon}
              </span>
            </div>
            <div className={styles.cardValue}>{stat.value}</div>
            <div className={styles.cardFooter}>
              <span className={stat.success ? styles.trendSuccess : styles.trendWarning}>
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Best Sellers & Alerts section */}
      <div className={styles.bottomSection}>
        <div className={styles.bestSellersCard}>
          <h2 className={styles.sectionTitle}>Productos Más Vendidos</h2>
          <Table headers={['Referencia', 'Nombre', 'Categoría', 'Prendas Vendidas', 'Ingresos Netos']}>
            {bestSellers.map((item, index) => (
              <TableRow key={index}>
                <TableCell style={{ fontWeight: 600 }}>{item.reference}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.category}</Badge>
                </TableCell>
                <TableCell>{item.sold} uds</TableCell>
                <TableCell style={{ fontWeight: 600 }}>{item.revenue}</TableCell>
              </TableRow>
            ))}
          </Table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
