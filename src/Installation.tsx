import { useEffect, useState } from 'react';

type InvitationInstall = Event & { prompt: () => Promise<void> };

const estInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const lireMasque = () => { try { return localStorage.getItem('install-masque') === '1'; } catch { return false; } };

/** Bandeau expliquant comment ajouter l'appli à l'écran d'accueil (affiché seulement dans le navigateur). */
export default function Installation() {
  const [invitation, setInvitation] = useState<InvitationInstall | null>(null);
  const [masque, setMasque] = useState(() => estInstallee() || lireMasque());
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setInvitation(e as InvitationInstall); };
    window.addEventListener('beforeinstallprompt', f);
    return () => window.removeEventListener('beforeinstallprompt', f);
  }, []);
  if (masque) return null;

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const fermer = () => { try { localStorage.setItem('install-masque', '1'); } catch { /* */ } setMasque(true); };

  return (
    <div className="install">
      <button className="install-fermer" onClick={fermer} aria-label="Fermer">✕</button>
      <b>Installez l'appli sur votre téléphone</b>
      {invitation ? (
        <button className="btn plein petit" onClick={async () => { await invitation.prompt(); setInvitation(null); }}>Installer l'appli</button>
      ) : ios ? (
        <ol>
          <li>Ouvrez cette page dans <b>Safari</b>.</li>
          <li>Appuyez sur <b>Partager</b> <span className="icone-partage">⬆︎</span> en bas de l'écran.</li>
          <li>Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li>
        </ol>
      ) : (
        <ol>
          <li>Ouvrez cette page dans <b>Chrome</b>.</li>
          <li>Appuyez sur le menu <b>⋮</b> en haut à droite.</li>
          <li>Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li>
        </ol>
      )}
    </div>
  );
}
