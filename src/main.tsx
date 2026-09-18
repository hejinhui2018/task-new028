import React from 'react';
import ReactDOM from 'react-dom/client';
import { StoreProvider } from './state/store';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
