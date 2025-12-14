import React from 'react';
import { createRoot } from 'react-dom/client';
import GraphViewPage from './GraphViewPage';

const mount = document.getElementById('root');
if (mount) {
  const root = createRoot(mount);
  root.render(<GraphViewPage />);
}
