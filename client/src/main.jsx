import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import SupportPage from './pages/SupportPage.jsx';

const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isSupportPage = currentPath === '/support' || currentPath === '/support/index.html';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSupportPage ? <SupportPage /> : <App />}
  </StrictMode>,
);
