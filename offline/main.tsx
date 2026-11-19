import React from 'react';
import { createRoot } from 'react-dom/client';
import Workspace from '@/app/components/workspace/workspace';
import { installOfflineTransport } from './transport';
import '@/app/globals.css';

document.documentElement.dataset.offlineApp = 'true';
installOfflineTransport();
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace /></React.StrictMode>);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }); });
}
