import React from 'react';
import styles from './Table.module.css';

export const Table = ({ headers, children, className = '', ...props }) => {
  return (
    <div className={styles.tableContainer}>
      <table className={[styles.table, className].join(' ')} {...props}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index} className={styles.th}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
};

export const TableRow = ({ children, className = '', ...props }) => {
  return (
    <tr className={[styles.tr, className].join(' ')} {...props}>
      {children}
    </tr>
  );
};

export const TableCell = ({ children, className = '', ...props }) => {
  return (
    <td className={[styles.td, className].join(' ')} {...props}>
      {children}
    </td>
  );
};
export default Table;
