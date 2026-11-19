import { useEffect, useRef, useState } from 'react';
import { chargerLogoPdf, euros } from './rapport';
import { construireReleve } from './releve';
import { partagerFichier } from './partage';
import { dateFR, distanceTexte, gpsTexte } from './format';
import {
  archiverPdf, chargerTournees, enregistrerTournees, importerZip, lireImage, statutFinal, supprimerTournee, totaux,
  type Decision, type TourneeImportee,
} from './validationDb';
import { TARIF_PHOTO_EUR, type PhotoRecord } from './types';
import { get, set } from 'idb-keyval';
import RapportClient from './RapportClient';
import DocumentsPdf from './DocumentsPdf';

/** Espace « Validation responsable » : ouvert avec l'adresse de l'appli suivie de #validation. */
export default function Validation() {
  const [tournees, setTournees] = useState<TourneeImportee[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [rapportClient, setRapportClient] = useState(false);
  const [documents, setDocuments] = useState(false);
  const [message, setMessage] = useState<{ txt: string; cls: string } | null>(null);
  const [import_, setImport] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => { chargerTournees().then(setTournees); }, []);
  const maj = (t: TourneeImportee[]) => { setTournees(t); enregistrerTournees(t); };

  const importer = async (f?: File) => {
    if (!f) return;
    setImport(true); setMessage(null);
    try {
      const t = await importerZip(f);
      const existante = tournees.find((x) => x.cle === t.cle);
      if (existante) t.decisions = existante.decisions;   // ré-import : on garde les décisions déjà prises
      maj([t, ...tournees.filter((x) => x.cle !== t.cle)]);
      setOuverte(t.cle);
      setMessage({ txt: `Tournée de ${t.intervenant} importée : ${t.photos.length} photo(s).`, cls: 'vert' });
    } catch (e) {
      setMessage({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    } finally {
      setImport(false);
    }
  };

  if (documents) return <DocumentsPdf onRetour={() => setDocuments(false)} />;
  if (rapportClient) return <RapportClient tournees={tournees} onRetour={() => setRapportClient(false)} />;
  const t = tournees.find((x) => x.cle === ouverte);
  if (t) {
    return <DetailTournee t={t} onRetour={() => setOuverte(null)}
      onChange={(nt) => maj(tournees.map((x) => (x.cle === nt.cle ? nt : x)))} />;
  }

  return (
    <div className="ecran">
      <header className="entete">
        <img src={`${import.meta.env.BASE_URL}logo-statera.png`} alt="STATERA Networks" className="logo" />
        <div className="nom-appli">PhotoTracker</div>
        <div className="titre-espace">Validation responsable</div>
      </header>
      <main className="contenu" style={{ paddingBottom: 40 }}>
        <input ref={fichier} type="file" accept=".zip,application/zip" hidden onChange={(e) => { importer(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="carte">
          <h2>Vérifier une tournée</h2>
          <ol className="aide liste-etapes">
            <li>Enregistrez le <b>.zip</b> reçu par mail (pièce jointe → Enregistrer dans Fichiers).</li>
            <li>Importez-le ici.</li>
            <li>Validez ou refusez chaque photo « À vérifier ».</li>
            <li>Générez le <b>relevé de validation</b> et envoyez-le (intervenant, comptabilité).</li>
          </ol>
          <button className="btn plein" disabled={import_} onClick={() => fichier.current?.click()}>
            {import_ ? 'Import en cours…' : 'Importer un .zip de tournée'}
          </button>
        </div>
        {message && <div className={`alerte ${message.cls}`}>{message.txt}</div>}

        <button className="btn contour" onClick={() => setDocuments(true)}>📄 Documents PDF (tout télécharger)</button>
        <div className="carte">
          <h2>Rapport donneur d'ordre</h2>
          <p className="aide">Compare le plan de route transmis avec les tournées reçues, puis prépare le rapport final
            (PDF + photos validées classées par site) à envoyer au client.</p>
          <button className="btn plein" onClick={() => setRapportClient(true)}>Préparer le rapport final</button>
        </div>
        <div className="carte">
          <h2>Préparer un plan de route</h2>
          <p className="aide">Modèle Excel à remplir puis à envoyer à l'intervenant. Colonnes obligatoires : Adresse, Code postal, Ville.
            Date, Site et Consigne sont conseillées ; sans colonne Ordre, l'appli calcule l'itinéraire optimal.</p>
          <a className="btn contour" href={`${import.meta.env.BASE_URL}plan-de-route-modele.xlsx`} download>Télécharger le modèle Excel</a>
        </div>
        <a className="btn contour" href="./" onClick={() => { location.hash = ''; }}>Ouvrir l'appli intervenant (plan de route, photos)</a>

        {tournees.map((x) => {
          const tt = totaux(x, TARIF_PHOTO_EUR);
          return (
            <button key={x.cle} className="carte tournee" onClick={() => setOuverte(x.cle)}>
              <div className="tournee-haut">
                <b>{x.intervenant}</b>
                {tt.enAttente ? <span className="badge orange">{tt.enAttente} à vérifier</span> : <span className="badge vert">Vérifiée</span>}
              </div>
              <small>Envoyée le {dateFR(x.creeLe).slice(0, 16)} · {tt.total} photo(s)</small>
              <small>À payer : <b>{euros(tt.montant)}</b> · {tt.refusees} refusée(s)</small>
            </button>
          );
        })}
      </main>
    </div>
  );
}

type Filtre = 'a_verifier' | 'toutes';

function DetailTournee({ t, onChange, onRetour }: { t: TourneeImportee; onChange: (t: TourneeImportee) => void; onRetour: () => void }) {
  const [filtre, setFiltre] = useState<Filtre>(t.photos.some((p) => p.conformite !== 'conforme') ? 'a_verifier' : 'toutes');
  const [responsable, setResponsable] = useState('');
  const [releve, setReleve] = useState<File | null>(null);
  const [grande, setGrande] = useState<PhotoRecord | null>(null);
  useEffect(() => { get<string>('statera-responsable').then((v) => v && setResponsable((a) => a || v)); }, []);

  const tt = totaux(t, TARIF_PHOTO_EUR);
  const visibles = t.photos
    .filter((p) => filtre === 'toutes' || p.conformite !== 'conforme')
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const decider = (p: PhotoRecord, d: Decision | null) => {
    const decisions = { ...t.decisions };
    if (d) decisions[p.id] = d; else delete decisions[p.id];
    onChange({ ...t, decisions });
    setReleve(null);
  };

  const generer = async () => {
    if (!responsable.trim()) return alert('Indiquez votre nom (visa du responsable).');
    if (tt.enAttente && !confirm(`${tt.enAttente} photo(s) sont encore en attente : elles seront indiquées « En attente » et non payées. Continuer ?`)) return;
    await set('statera-responsable', responsable.trim());
    const f = construireReleve(t, responsable.trim(), await chargerLogoPdf());
    await archiverPdf('releve', f, `${t.intervenant} – tournée envoyée le ${dateFR(t.creeLe).slice(0, 10)}`);
    setReleve(f);
  };

  return (
    <div className="ecran">
      <header className="barre-haut"><button className="lien" onClick={onRetour}>‹ Retour</button><h1>{t.intervenant}</h1><span style={{ width: 70 }} /></header>
      <main className="contenu" style={{ paddingBottom: 40 }}>
        <div className="kpis">
          <div className="kpi"><b>{tt.enAttente}</b><span>en attente</span></div>
          <div className="kpi"><b>{tt.auto + tt.manuelles}</b><span>validées</span></div>
          <div className="kpi"><b>{tt.refusees}</b><span>refusées</span></div>
        </div>
        <div className="kpi total"><b>{euros(tt.montant)}</b><span>à payer ({tt.payees} × {euros(TARIF_PHOTO_EUR)})</span></div>

        <div className="segment">
          <button className={filtre === 'a_verifier' ? 'actif' : ''} onClick={() => setFiltre('a_verifier')}>À vérifier ({tt.aVerifier})</button>
          <button className={filtre === 'toutes' ? 'actif' : ''} onClick={() => setFiltre('toutes')}>Toutes ({tt.total})</button>
        </div>
        {visibles.length === 0 && <p className="aide centre">Aucune photo à vérifier : toutes les adresses ont été validées automatiquement.</p>}

        {visibles.map((p) => {
          const s = statutFinal(t, p);
          const dec = t.decisions[p.id];
          const lienCarte = p.latitudeSite != null && p.latitude != null
            ? `https://www.google.com/maps/dir/?api=1&origin=${p.latitude},${p.longitude}&destination=${p.latitudeSite},${p.longitudeSite}`
            : p.latitude != null ? `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}` : null;
          return (
            <article key={p.id} className={`carte photo-verif ${s}`}>
              <button className="img-bouton" onClick={() => setGrande(p)}><ImageValidation cle={t.cle} id={p.id} /></button>
              <div className="gras">{p.adresse}</div>
              <div className="aide">{p.codePostal} {p.ville} · {p.departement} · {dateFR(p.dateISO)}</div>
              {p.conformite !== 'conforme' && <div className="alerte orange">Motif : {p.motifVerification ?? 'adresse non validée'}</div>}
              <div className="aide">GPS adresse : <b>{gpsTexte(p.latitudeSite ?? null, p.longitudeSite ?? null)}</b></div>
              <div className="aide">GPS smartphone : <b>{gpsTexte(p.latitude, p.longitude)}</b>{p.precision != null ? ` (±${Math.round(p.precision)} m)` : ''}</div>
              {p.ecartM != null && <div className="aide">Écart : <b>{distanceTexte(p.ecartM)}</b></div>}
              {p.note && <div className="aide">Note : {p.note}</div>}
              {lienCarte && <a className="btn contour petit" href={lienCarte} target="_blank" rel="noreferrer">Voir sur la carte (smartphone → adresse)</a>}

              <div className={`statut ${s}`}>
                {s === 'validee_auto' ? '✓ Validée automatiquement' : s === 'validee' ? '✓ Validée par vous' : s === 'refusee' ? '✕ Refusée' : '⏳ En attente de votre décision'}
              </div>
              <div className="actions">
                <button className={`btn petit ${s === 'validee' ? 'plein' : 'contour'}`}
                  onClick={() => decider(p, { statut: 'validee', commentaire: '', dateISO: new Date().toISOString() })}>✓ Valider</button>
                <button className={`btn petit ${s === 'refusee' ? 'rouge' : 'contour-rouge'}`}
                  onClick={() => {
                    const c = prompt('Motif du refus (transmis à l\'intervenant) :', dec?.commentaire ?? '');
                    if (c !== null) decider(p, { statut: 'refusee', commentaire: c.trim(), dateISO: new Date().toISOString() });
                  }}>✕ Refuser</button>
              </div>
              {dec && <button className="lien-petit" onClick={() => decider(p, null)}>Annuler ma décision</button>}
              {dec?.commentaire && <div className="aide">Motif du refus : {dec.commentaire}</div>}
            </article>
          );
        })}

        <div className="carte">
          <h3>Transmettre ma décision</h3>
          <label className="champ"><span>Votre nom (visa)</span>
            <input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nom du responsable" /></label>
          {!releve ? (
            <button className="btn plein" onClick={generer}>Générer le relevé de validation (PDF)</button>
          ) : (
            <button className="btn plein" onClick={() => partagerFichier(releve, 'Relevé de validation', `Relevé de validation – ${t.intervenant} : ${euros(tt.montant)} à payer.`)}>
              Envoyer le relevé (mail, Drive…)
            </button>
          )}
          <p className="aide">Le relevé indique, photo par photo, votre décision et le montant final à payer.</p>
        </div>
        <button className="btn texte-rouge" onClick={async () => {
          if (!confirm('Supprimer cette tournée de votre appareil ? (les décisions seront perdues)')) return;
          await supprimerTournee(t);
          const reste = (await chargerTournees()).filter((x) => x.cle !== t.cle);
          await enregistrerTournees(reste);
          location.reload();
        }}>Supprimer cette tournée de l'appareil</button>
      </main>

      {grande && (
        <div className="modal" onClick={() => setGrande(null)}>
          <div className="modal-contenu"><ImageValidation cle={t.cle} id={grande.id} grande /></div>
        </div>
      )}
    </div>
  );
}

function ImageValidation({ cle, id, grande }: { cle: string; id: string; grande?: boolean }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    lireImage(cle, id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [cle, id]);
  return url ? <img src={url} alt="" className={grande ? 'img-grande' : 'img-verif'} /> : <div className={grande ? 'img-grande' : 'img-verif'} />;
}
