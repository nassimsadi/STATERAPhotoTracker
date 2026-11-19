import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import Validation from './Validation';

/** Adresse de l'appli + « #validation » → espace du responsable. */
function Racine() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return hash.startsWith('#validation') ? <Validation /> : <App />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Racine /></StrictMode>);
