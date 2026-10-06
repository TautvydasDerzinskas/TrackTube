import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppThemeProvider } from './components/AppThemeProvider';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { MobileAppGate } from './components/MobileAppGate';
import { InstallPrompt } from './components/InstallPrompt';
import './fonts.css';
import './i18n';

// Production only: in dev a worker would sit between Vite's HMR and the
// browser and serve stale modules from its cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppThemeProvider>
        <MobileAppGate />
        <InstallPrompt />
        <ToastProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </ToastProvider>
      </AppThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
