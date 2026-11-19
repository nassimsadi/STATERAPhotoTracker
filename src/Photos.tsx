import { useEffect, useMemo, useState } from 'react';
import { lireBlob } from './db';
import { creerZip } from './exportZip';
import { partagerFichier } from './partage';
import { dateFR, gpsTexte, horodatageFichier } from './format';
import { grouper } from './regroupement';
import type { PhotoRecord } from './types';

type Props = { photos: PhotoRecord[]; onSupprimer: (id: string) => void };

export default function Photos({ photos, onSupprimer }: Props) {
  const groupes = useMemo(() => grouper(photos), [photos]);
  const [fermes, setFermes] = useState<Record<string, boolean>>({});
  const [zipPret, setZipPret] = useState<{ cle: string; f: File; nb: number } | null>(null);
  const [prepa, setPrepa] = useState<string | null>(null);
  const [selection, setSelection] = useState<PhotoRecord | null>(null);
  const nbVilles = groupes.reduce((n, g) => n + g.villes.length, 0);

  // Étape 1 : préparer le zip ; étape 2 (nouveau geste) : l'envoyer. Le téléphone exige un appui pour ouvrir le partage.
  const preparer = async (liste: PhotoRecord[], titre: string, cle: string) => {
    setPrepa(cle);
    try {
      setZipPret({ cle, f: await creerZip(liste, `${titre}_${horodatageFichier(new Date().toISOString())}`), nb: liste.length });
    } finally {
      setPrepa(null);
    }
  };

  if (!photos.length) {
    return (
      <main className="contenu">
        <div className="carte">
          <h2>Aucune photo dans la tournée</h2>
          <p className="aide">Prenez une photo depuis le plan de route ou avec « Photo hors plan ». Les photos sont classées
            ici par département, puis par ville.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="contenu">
      <p className="stats">Tournée en cours : {photos.length} photo(s) · {groupes.length} département(s) · {nbVilles} ville(s)</p>
      {groupes.map((g) => {
        const toutes = g.villes.flatMap((v) => v.photos);
        const ouvert = !fermes[g.departement];
        const pret = zipPret?.cle === g.departement ? zipPret : null;
        return (
          <section key={g.departement} className="carte dep">
            <div className="dep-entete">
              <button className="dep-titre" onClick={() => setFermes({ ...fermes, [g.departement]: ouvert })}>
                <span className="chevron">{ouvert ? '▾' : '▸'}</span>
                <span>
                  <b>{g.departement}</b>
                  <small>{toutes.length} photo(s) · {g.villes.length} ville(s)</small>
                </span>
              </button>
              {pret ? (
                <button className="mini vert" onClick={async () => { await partagerFichier(pret.f, `Photos – ${g.departement}`, `${pret.nb} photo(s) de site.`); setZipPret(null); }}>Envoyer ✉</button>
              ) : (
                <button className="mini" disabled={!!prepa} onClick={() => preparer(toutes, g.departement, g.departement)}>
                  {prepa === g.departement ? '…' : '.zip'}
                </button>
              )}
            </div>
            {ouvert && g.villes.map((v) => (
              <div key={v.ville} className="ville">
                <div className="ville-nom">{v.ville} <small>({v.photos.length})</small></div>
                <div className="defile">
                  {v.photos.map((p) => (
                    <button key={p.id} className="vignette" onClick={() => setSelection(p)}>
                      <Vignette id={p.id} />
                      {p.conformite !== 'conforme' && <span className="badge-verif">À vérifier</span>}
                      <small>{dateFR(p.dateISO).slice(0, 16)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}

      {selection && (
        <div className="modal" onClick={() => setSelection(null)}>
          <div className="modal-contenu" onClick={(e) => e.stopPropagation()}>
            <Vignette id={selection.id} grand />
            <div className="modal-infos">
              <div>{selection.adresse}, {selection.codePostal} {selection.ville}</div>
              <div>{selection.departement}</div>
              <div>GPS : {gpsTexte(selection.latitude, selection.longitude)} · {selection.conformite === 'conforme' ? `adresse validée (${selection.ecartM} m)` : `À VÉRIFIER : ${selection.motifVerification ?? ''}`}</div>
              <div>{dateFR(selection.dateISO)}</div>
              <div className="actions">
                <button className="btn plein petit" onClick={() => setSelection(null)}>Fermer</button>
                <button className="btn rouge petit" onClick={() => {
                  if (confirm('Supprimer définitivement cette photo ?')) { onSupprimer(selection.id); setSelection(null); }
                }}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Vignette({ id, grand }: { id: string; grand?: boolean }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    lireBlob(id).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img src={url} className={grand ? 'img-grande' : 'img-vignette'} alt="" /> : <div className={grand ? 'img-grande' : 'img-vignette'} />;
}
