import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes.jsx';
import ErrorBoundary from './components/Common/ErrorBoundary.jsx';

function App() {
  return (
    <ErrorBoundary>
      {/* D140: React Router 7 envuelve cada navegación en startTransition. La app se escribió y probó con la
          navegación síncrona de v6 (filtros por URL, checkboxes controlados, foco tras navegar); se conserva. */}
      <BrowserRouter useTransitions={false}>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
