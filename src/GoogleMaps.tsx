import { useState } from 'react';

const CLE = 'gmaps-ok';
const lire = () => { try { return localStorage.getItem(CLE) === '1'; } catch { return false; } };

/** Encart de démarrage : installer Google Maps, qui sert à la navigation de la tournée. */
export default function InviteGoogleMaps() {
  const [ok, setOk] = useState(lire);
  if (ok) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const android = /Android/.test(navigator.userAgent);
  const ios_ = 'https://apps.apple.com/app/google-maps/id585027354';
  const play = 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps';
  const fini = () => { try { localStorage.setItem(CLE, '1'); } catch { /* */ } setOk(true); };
  return (
    <div className="gmaps">
      <b>Avant de commencer : installez Google Maps</b>
      <p>La navigation de votre tournée s'ouvre dans <b>Google Maps</b>, avec les étapes dans l'ordre de passage (jusqu'à 10 à la fois).
        Installez-la si elle n'est pas déjà sur votre téléphone.</p>
      <div className="actions">
        {(ios || !android) && <a className="btn plein petit" href={ios_} target="_blank" rel="noreferrer">Installer (App Store)</a>}
        {(android || !ios) && <a className="btn plein petit" href={play} target="_blank" rel="noreferrer">Installer (Google Play)</a>}
        <button className="btn contour petit" onClick={fini}>C'est fait</button>
      </div>
    </div>
  );
}
