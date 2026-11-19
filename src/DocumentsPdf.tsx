import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { dateFR, horodatageFichier } from './format';
import {
  chargerDocuments, LIBELLE_TYPE, lireDocument, supprimerDocument, type DocumentPdf, type TypeDocument,
} from './validationDb';

function telecharger(b: Blob, nom: string) {
  const url = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const DOSSIER: Record<TypeDocument, string> = {
  rapport_intervenant: 'Rapports_intervenants', releve: 'Releves_validation', rapport_client: 'Rapports_donneur_ordre',
};

/** Espace responsable : tous les PDF (rapports intervenants, relevés, rapports donneur d'ordre). */
export default function DocumentsPdf({ onRetour }: { onRetour: () => void }) {
  const [docs, setDocs] = useState<DocumentPdf[]>([]);
  const [filtre, setFiltre] = useState<TypeDocument | 'tous'>('tous');
  const [etat, setEtat] = useState<string | null>(null);
  useEffect(() => { chargerDocuments().then(setDocs); }, []);

  const visibles = docs.filter((d) => filtre === 'tous' || d.type === filtre).sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const toutTelecharger = async () => {
    setEtat('Préparation du fichier…');
    try {
      const zip = new JSZip();
      for (const d of visibles) {
        const b = await lireDocument(d.id);
        if (b) zip.file(`${DOSSIER[d.type]}/${d.nom}`, b);
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      telecharger(blob, `PDF_STATERA_PhotoTracker_${filtre === 'tous' ? 'tous' : DOSSIER[filtre]}_${horodatageFichier(new Date().toISOString()).slice(0, 8)}.zip`);
    } finally {
      setEtat(null);
    }
  };

  const compte = (t: TypeDocument) => docs.filter((d) => d.type === t).length;

  return (
    <div className="ecran">
      <header className="barre-haut"><button className="lien" onClick={onRetour}>‹ Retour</button><h1>Documents PDF</h1><span style={{ width: 70 }} /></header>
      <main className="contenu" style={{ paddingBottom: 40 }}>
        <div className="segment segment-wrap">
          <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>Tous ({docs.length})</button>
          <button className={filtre === 'rapport_intervenant' ? 'actif' : ''} onClick={() => setFiltre('rapport_intervenant')}>Intervenants ({compte('rapport_intervenant')})</button>
          <button className={filtre === 'releve' ? 'actif' : ''} onClick={() => setFiltre('releve')}>Relevés ({compte('releve')})</button>
          <button className={filtre === 'rapport_client' ? 'actif' : ''} onClick={() => setFiltre('rapport_client')}>Clients ({compte('rapport_client')})</button>
        </div>

        {visibles.length > 0 ? (
          <button className="btn plein" disabled={!!etat} onClick={toutTelecharger}>
            {etat ?? `⬇ Tout télécharger (${visibles.length} PDF, un seul fichier .zip)`}
          </button>
        ) : (
          <p className="aide centre">
            Aucun document. Les PDF apparaissent ici automatiquement : rapports des intervenants (à l'import de leur .zip),
            relevés de validation et rapports donneur d'ordre (à leur génération).
          </p>
        )}

        {(['rapport_intervenant', 'releve', 'rapport_client'] as TypeDocument[])
          .filter((t) => filtre === 'tous' || filtre === t)
          .map((t) => {
            const liste = visibles.filter((d) => d.type === t);
            if (!liste.length) return null;
            return (
              <section key={t}>
                <h4 className="titre-jour">{LIBELLE_TYPE[t]}</h4>
                <ol className="liste-jour">
                  {liste.map((d) => (
                    <li key={d.id}>
                      <span className="pastille-statut realise">📄</span>
                      <span className="liste-texte"><b>{d.titre}</b><small>{dateFR(d.dateISO).slice(0, 16)} · {(d.taille / 1024).toFixed(0)} Ko</small></span>
                      <button className="mini" aria-label="Télécharger" onClick={async () => { const b = await lireDocument(d.id); if (b) telecharger(b, d.nom); }}>⬇</button>
                      <button className="mini gris" aria-label="Supprimer" onClick={async () => {
                        if (!confirm(`Supprimer « ${d.nom} » de cet appareil ?`)) return;
                        await supprimerDocument(d.id); setDocs(await chargerDocuments());
                      }}>✕</button>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
      </main>
    </div>
  );
}
