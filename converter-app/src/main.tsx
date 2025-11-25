import '@esri/calcite-components/dist/calcite/calcite.css';
import { defineCustomElements } from '@esri/calcite-components/dist/loader';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthProvider'
import App from './App.tsx'
import './index.css'

// Register Calcite web components via Stencil loader
defineCustomElements(window);

// Global error instrumentation (dev only) to diagnose "e is not defined" ReferenceError
if (import.meta.env.DEV) {
  window.addEventListener('error', (ev) => {
    const refMatch = /(.*) is not defined/.exec(ev.message);
    // Log structured details for stack triage
    console.debug('[GlobalError]', {
      message: ev.message,
      referenceIdentifier: refMatch ? refMatch[1] : undefined,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      stack: ev.error?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    let reason: any = ev.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message;
    const stack = reason?.stack;
    const refMatch = msg ? /(.*) is not defined/.exec(msg) : null;
    console.debug('[UnhandledRejection]', {
      message: msg,
      referenceIdentifier: refMatch ? refMatch[1] : undefined,
      stack,
      reason,
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
