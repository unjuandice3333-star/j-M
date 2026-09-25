import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
export const Button: React.FC<ButtonProps>;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
export const Input: React.FC<InputProps>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'destructive';
}
export const Badge: React.FC<BadgeProps>;

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  headers: string[];
}
export const Table: React.FC<TableProps>;
export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>>;
export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>>;
