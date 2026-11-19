import { useEffect, useState } from 'react';
import { ecrireBlob, lireBlob } from './db';
import { creerZip } from './exportZip';
import { euros } from './rapport';
import { dateFR } from './format';
import { libelleJour } from './plan';
import type { PhotoRecord, Rapport } from './types';

type Props = { rapports: Rapport[]; photos: PhotoRecord[]; onSupprimer: (r: Rapport) => void; onMajRapport: (r: Rapport) => void };

/** Télécharge un fichier sur l'appareil (Téléchargements / Fichiers). */
function telecharger(b: Blob, nom: string) {
  const url = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const jourDe = (iso: string) => iso.slice(0, 10).split('-').length === 3 ? (() => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})() : iso;

/** Onglet « Réalisations » : tournées clôturées, avec leur rapport PDF et leur .zip. */
export default function Realisations({ rapports, photos, onSupprimer, onMajRapport }: Props) {
  const [espace, setEspace] = useState<string>('');
  const [message, setMessage] = useState<{ txt: string; cls: string } | null>(null);
  const [reconstruction, setReconstruction] = useState<string | null>(null);
  // Tournées clôturées avant la conservation du .zip : nombre d'images encore présentes sur le téléphone
  const [disponibles, setDisponibles] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      const r: Record<string, number> = {};
      for (const x of rapports.filter((y) => !y.zipCle)) {
        let n = 0;
        for (const p of photos.filter((q) => q.tourneeId === x.id)) if (await lireBlob(p.id)) n++;
        r[x.id] = n;
      }
      setDisponibles(r);
    })();
  }, [rapports, photos]);

  /** Reconstitue le .zip d'une tournée clôturée avant la mise à jour, à partir des images restées sur le téléphone. */
  const reconstituer = async (r: Rapport) => {
    setReconstruction(r.id); setMessage(null);
    try {
      const pdf = r.pdfUri ? await lireBlob(r.pdfUri) : undefined;
      const f = await creerZip(photos.filter((p) => p.tourneeId === r.id), r.zipNom.replace(/\.zip$/, ''), r.intervenant,
        pdf ? new File([pdf], `Rapport_${r.intervenant.replace(/\s+/g, '_')}_${r.id}.pdf`, { type: 'application/pdf' }) : undefined);
      await ecrireBlob(`zip:${r.id}`, f);
      onMajRapport({ ...r, zipCle: `zip:${r.id}` });
      telecharger(f, f.name);
      setMessage({ txt: `.zip reconstitué (${disponibles[r.id]} photo(s)) et conservé dans cette réalisation.`, cls: 'vert' });
    } catch (e) {
      setMessage({ txt: `Reconstitution impossible : ${String(e)}`, cls: 'rouge' });
    } finally {
      setReconstruction(null);
    }
  };
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setEspace(`${(e.usage / 1048576).toFixed(0)} Mo utilisés sur ce téléphone`)).catch(() => {});
  }, [rapports]);

  if (!rapports.length) {
    return (
      <main className="contenu">
        <div className="carte">
          <h2>Aucune tournée clôturée</h2>
          <p className="aide">À la fin de chaque journée, faites « Fin de tournée » : la journée est alors clôturée et rangée ici,
            avec son rapport PDF et son dossier .zip de photos.</p>
        </div>
      </main>
    );
  }

  const ouvrir = async (r: Rapport, type: 'pdf' | 'zip') => {
    setMessage(null);
    const cle = type === 'pdf' ? r.pdfUri : r.zipCle;
    const b = cle ? await lireBlob(cle) : undefined;
    if (!b) return setMessage({ txt: `Le ${type === 'pdf' ? 'rapport PDF' : '.zip'} de cette tournée n'est plus disponible sur ce téléphone.`, cls: 'orange' });
    telecharger(b, type === 'pdf' ? `Rapport_${r.intervenant.replace(/\s+/g, '_')}_${r.id}.pdf` : r.zipNom);
  };

  // Regroupement par mois, tournées les plus récentes d'abord
  const tries = [...rapports].sort((a, b) => b.debutISO.localeCompare(a.debutISO));
  const mois = new Map<string, Rapport[]>();
  tries.forEach((r) => {
    const m = new Date(r.debutISO).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    mois.set(m, [...(mois.get(m) ?? []), r]);
  });

  return (
    <main className="contenu">
      <p className="stats">{rapports.length} tournée(s) clôturée(s){espace ? ` · ${espace}` : ''}</p>
      {message && <div className={`alerte ${message.cls}`}>{message.txt}</div>}
      {[...mois.entries()].map(([m, liste]) => (
        <section key={m}>
          <h4 className="titre-jour">{m}</h4>
          {liste.map((r) => {
            const j1 = jourDe(r.debutISO), j2 = jourDe(r.finISO);
            return (
              <article key={r.id} className="carte realisation">
                <div className="realisation-haut">
                  <b>{j1 === j2 ? libelleJour(j1) : `Du ${libelleJour(j1)} au ${libelleJour(j2)}`}</b>
                  <span className="badge vert">Clôturée</span>
                </div>
                <div className="aide">{r.intervenant} · clôturée le {dateFR(r.dateISO).slice(0, 16)}</div>
                <div className="realisation-chiffres">
                  <span><b>{r.nbSites}</b> sites</span>
                  <span><b>{r.nbPhotos}</b> photos</span>
                  <span><b>{euros(r.montant)}</b> validés</span>
                </div>
                {r.nbAVerifier ? <div className="aide">{r.nbAVerifier} photo(s) soumise(s) à la vérification du responsable</div> : null}
                {r.avancementPlan?.total ? <div className="aide">Avancement du plan de route à la clôture : {r.avancementPlan.pct} %</div> : null}
                <div className="actions">
                  <button className="btn contour petit" onClick={() => ouvrir(r, 'pdf')}>⬇ Rapport PDF</button>
                  {r.zipCle || !disponibles[r.id] ? (
                    <button className="btn contour petit" disabled={!r.zipCle} onClick={() => ouvrir(r, 'zip')}>⬇ Photos (.zip)</button>
                  ) : (
                    <button className="btn plein petit" disabled={!!reconstruction} onClick={() => reconstituer(r)}>
                      {reconstruction === r.id ? 'Reconstitution…' : `↻ Reconstituer le .zip (${disponibles[r.id]} photos)`}
                    </button>
                  )}
                </div>
                {!r.zipCle && disponibles[r.id] === 0 && (
                  <div className="aide">.zip non conservé (tournée clôturée avant la mise à jour) et photos plus présentes sur ce téléphone :
                    utilisez le .zip envoyé par mail ce jour-là.</div>
                )}
                <button className="btn texte-rouge petit-supprimer" onClick={() => {
                  if (confirm(
                    `Supprimer de ce téléphone la tournée du ${dateFR(r.debutISO).slice(0, 10)} : rapport PDF, photos et .zip ?\n\n`
                    + '⚠️ ATTENTION : si les photos n\'ont pas été envoyées à STATERA, elles seront perdues. '
                    + 'Un nouveau passage sur site pourra alors être exigé pour que ces photos soient payées.\n\n'
                    + 'Confirmez-vous que le .zip a bien été envoyé à STATERA ?',
                  )) onSupprimer(r);
                }}>🗑 Supprimer de ce téléphone (rapport, photos et .zip)</button>
                <p className="aide avertissement">Ne supprimez qu'après avoir envoyé le .zip à STATERA : sans les photos, un repassage sur site
                  peut être exigé pour paiement.</p>
              </article>
            );
          })}
        </section>
      ))}
    </main>
  );
}
