import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PublicSharePage } from './PublicShare';
import './styles/variables.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

// Public share links get their own page, so no workspace session is needed.
const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);

createRoot(container).render(
  <StrictMode>
    {shareMatch ? <PublicSharePage token={decodeURIComponent(shareMatch[1])} /> : <App />}
  </StrictMode>
);
