import { useEffect, useMemo, useState } from 'react';
import Capture from './Capture';
import Plan from './Plan';
import TourneeJour from './TourneeJour';
import Realisations from './Realisations';
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
  const [onglet, setOnglet] = useState<'plan' | 'tournee' | 'photos' | 'realisations'>('plan');
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
  /** Supprime une tournée clôturée du téléphone (PDF, .zip et images restantes). */
  const supprimerRealisation = async (r: Rapport) => {
    const rs = rapports.filter((x) => x.id !== r.id);
    const liste = photos.filter((p) => p.tourneeId !== r.id);
    setRapports(rs); setPhotos(liste);
    await Promise.all([
      enregistrerRapports(rs), enregistrerPhotos(liste),
      ...[r.pdfUri, r.zipCle].filter(Boolean).map((c) => supprimerBlob(c!)),
      ...photos.filter((p) => p.tourneeId === r.id).map((p) => supprimerBlob(p.id)),
    ]);
  };
  const photographier = (etape: EtapePlan | null) => setEcran({ nom: 'capture', etape, cle: Date.now() });

  if (ecran.nom === 'capture') {
    return <Capture key={ecran.cle} etape={ecran.etape} onEnregistree={ajouter} onFermer={() => setEcran({ nom: 'accueil' })} />;
  }
  if (ecran.nom === 'fin') {
    return <FinTournee photosTournee={photosTournee} rapports={rapports} avancementPlan={av} onCloturer={cloturer}
      onRetour={() => { setEcran({ nom: 'accueil' }); setOnglet('plan'); }}
      onRealisations={() => { setEcran({ nom: 'accueil' }); setOnglet('realisations'); }} />;
  }

  return (
    <div className="ecran">
      <header className="entete">
        <img src={`${import.meta.env.BASE_URL}logo-statera.png`} alt="STATERA Networks" className="logo" />
        <div className="nom-appli">PhotoTracker</div>
        <nav className="onglets">
          <button className={onglet === 'plan' ? 'actif' : ''} onClick={() => setOnglet('plan')}>
            Plan<small>{av ? `${av.pct} %` : '\u00a0'}</small>
          </button>
          <button className={onglet === 'tournee' ? 'actif' : ''} onClick={() => setOnglet('tournee')}>
            Tournée<small>du jour</small>
          </button>
          <button className={onglet === 'photos' ? 'actif' : ''} onClick={() => setOnglet('photos')}>
            Photos<small>{photosTournee.length}</small>
          </button>
          <button className={onglet === 'realisations' ? 'actif' : ''} onClick={() => setOnglet('realisations')}>
            Réalisations<small>{rapports.length || '\u00a0'}</small>
          </button>
        </nav>
      </header>
      <Installation />
      {!charge ? <main className="contenu"><p className="aide centre">Chargement…</p></main> : onglet === 'tournee'
        ? <TourneeJour plan={plan} photos={photos} onMajPlan={(p) => { setPlan(p); enregistrerPlan(p); }}
            onPhotographier={photographier} onAllerAuPlan={() => setOnglet('plan')} />
        : onglet === 'plan'
        ? <Plan plan={plan} photos={photos} onImporter={(p) => { setPlan(p); enregistrerPlan(p); }} onPhotographier={photographier} />
        : onglet === 'realisations'
        ? <Realisations rapports={rapports} onSupprimer={supprimerRealisation} />
        : <Photos photos={photosTournee} onSupprimer={supprimer} nbCloturees={photos.length - photosTournee.length} onRealisations={() => setOnglet('realisations')} />}
      <footer className="barre-bas">
        <button className="btn plein" onClick={() => photographier(null)}>📷 Photo hors plan</button>
        <button className="btn contour" onClick={() => setEcran({ nom: 'fin' })}>🏁 Fin de tournée</button>
      </footer>
    </div>
  );
}
