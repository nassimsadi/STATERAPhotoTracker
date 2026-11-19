import { useEffect, useMemo, useState } from 'react';
import Capture from './Capture';
import Plan from './Plan';
import Photos from './Photos';
import FinTournee from './FinTournee';
import Installation from './Installation';
import { avancement } from './regroupement';
import {
  chargerPhotos, chargerPlan, chargerRapports, demanderPersistance, enregistrerPhotos, enregistrerPlan, enregistrerRapports, supprimerBlob,
} from './db';
import type { EtapePlan, PhotoRecord, Rapport } from './types';

type Ecran = { nom: 'accueil' } | { nom: 'capture'; etape: EtapePlan | null; cle: number } | { nom: 'fin' };

export default function App() {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'accueil' });
  const [onglet, setOnglet] = useState<'plan' | 'photos'>('plan');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [plan, setPlan] = useState<EtapePlan[]>([]);
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    Promise.all([chargerPhotos(), chargerPlan(), chargerRapports()]).then(([ph, pl, ra]) => {
      setPhotos(ph); setPlan(pl); setRapports(ra); setCharge(true);
    });
    demanderPersistance();
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [ecran.nom, onglet]);

  const photosTournee = useMemo(() => photos.filter((p) => !p.tourneeId), [photos]);
  const av = plan.length ? avancement(plan, photos) : undefined;

  const ajouter = async (r: PhotoRecord, continuer: boolean) => {
    const liste = [...photos, r];
    setPhotos(liste);
    await enregistrerPhotos(liste);
    if (!continuer) setEcran({ nom: 'accueil' });
  };
  const supprimer = async (id: string) => {
    const liste = photos.filter((p) => p.id !== id);
    setPhotos(liste);
    await Promise.all([enregistrerPhotos(liste), supprimerBlob(id)]);
  };
  const cloturer = async (r: Rapport) => {
    const ids = new Set(photosTournee.map((p) => p.id));
    // On garde les images de la tournée qui se termine (sécurité si le .zip doit être renvoyé),
    // et on libère celles des tournées précédentes. Les fiches restent (avancement du plan).
    const anciennes = photos.filter((p) => p.tourneeId).map((p) => p.id);
    const liste = photos.map((p) => (ids.has(p.id) ? { ...p, tourneeId: r.id } : p));
    const rs = [...rapports, r];
    setPhotos(liste); setRapports(rs);
    await Promise.all([enregistrerPhotos(liste), enregistrerRapports(rs), ...anciennes.map(supprimerBlob)]);
  };
  const photographier = (etape: EtapePlan | null) => setEcran({ nom: 'capture', etape, cle: Date.now() });

  if (ecran.nom === 'capture') {
    return <Capture key={ecran.cle} etape={ecran.etape} onEnregistree={ajouter} onFermer={() => setEcran({ nom: 'accueil' })} />;
  }
  if (ecran.nom === 'fin') {
    return <FinTournee photosTournee={photosTournee} rapports={rapports} avancementPlan={av} onCloturer={cloturer}
      onRetour={() => { setEcran({ nom: 'accueil' }); setOnglet('plan'); }} />;
  }

  return (
    <div className="ecran">
      <header className="entete">
        <img src={`${import.meta.env.BASE_URL}logo-statera.png`} alt="STATERA Networks" className="logo" />
        <div className="nom-appli">PhotoTracker</div>
        <nav className="onglets">
          <button className={onglet === 'plan' ? 'actif' : ''} onClick={() => setOnglet('plan')}>
            Plan de route{av ? ` · ${av.pct} %` : ''}
          </button>
          <button className={onglet === 'photos' ? 'actif' : ''} onClick={() => setOnglet('photos')}>
            Photos ({photosTournee.length})
          </button>
        </nav>
      </header>
      <Installation />
      {!charge ? <main className="contenu"><p className="aide centre">Chargement…</p></main> : onglet === 'plan'
        ? <Plan plan={plan} photos={photos} onImporter={(p) => { setPlan(p); enregistrerPlan(p); }} onPhotographier={photographier} />
        : <Photos photos={photosTournee} onSupprimer={supprimer} />}
      <footer className="barre-bas">
        <button className="btn plein" onClick={() => photographier(null)}>📷 Photo hors plan</button>
        <button className="btn contour" onClick={() => setEcran({ nom: 'fin' })}>🏁 Fin de tournée</button>
      </footer>
    </div>
  );
}
