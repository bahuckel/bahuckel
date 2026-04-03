import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SocketProvider } from './context/SocketContext';
import { SettingsProvider } from './context/SettingsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './index-neon.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SocketProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </SocketProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
