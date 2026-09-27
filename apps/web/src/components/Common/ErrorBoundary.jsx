import React from 'react';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary Captured]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#FFFFFF',
          color: '#09090B'
        }}>
          <AlertTriangle size={56} color="#E11D48" style={{ marginBottom: '1.25rem' }} />
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Algo no salió como esperábamos
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#71717A', maxWidth: '480px', marginBottom: '2rem', lineHeight: 1.6 }}>
            Ocurrió un inconveniente temporal al cargar esta sección. Puedes recargar la página o volver a la tienda principal.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                padding: '0.85rem 1.6rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={18} /> RECARGAR PÁGINA
            </button>
            <a
              href="/"
              style={{
                backgroundColor: '#FAFAFA',
                border: '1px solid #E4E4E7',
                color: '#09090B',
                padding: '0.85rem 1.6rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                textDecoration: 'none'
              }}
            >
              <Home size={18} /> IR AL INICIO
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
