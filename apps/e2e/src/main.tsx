import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'antd/dist/reset.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(<App />);
