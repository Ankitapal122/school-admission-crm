import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import './styles-original.css';
import './wireframe-components.css';

// PWA Service Worker Registration (Immediate on startup so beforeinstallprompt fires fast)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      console.log('[PWA] Service Worker registered with scope:', reg.scope);

      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available, dispatching update event');
              window.dispatchEvent(new CustomEvent('pwa-update-available'));
            }
          };
        }
      };
    })
    .catch((err) => {
      console.warn('[PWA] Service Worker registration failed:', err);
    });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (status && [400, 401, 403, 404, 422, 423, 429].includes(status)) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: 3000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);


