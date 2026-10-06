import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesktopApp } from './DesktopApp.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
