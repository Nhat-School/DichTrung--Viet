import { createRoot } from 'react-dom/client';
import { App } from '../../ui/App';
import '../../ui/style.css';
document.body.classList.add('options');
createRoot(document.getElementById('root')!).render(<App initialTab="settings" />);
