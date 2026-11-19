import { useEffect, useMemo, useState } from 'react';
import { ecrireBlob, ecrireIntervenant, lireIntervenant } from './db';
import { creerZip } from './exportZip';
import { partagerFichier } from './partage';
import { bilanTournee, chargerLogoPdf, construirePdf, euros } from './rapport';
import { dateFR, horodatageFichier, nomSur } from './format';
import type { PhotoRecord, Rapport } from './types';

type Props = {
  photosTournee: PhotoRecord[];
  rapports: Rapport[];
  avancementPlan?: { faites: number; total: number; pct: number };
  onCloturer: (r: Rapport) => Promise<void>;
  onRetour: () => void;
  onRealisations: () => void;
};

export default function FinTournee({ photosTournee, rapports, avancementPlan, onCloturer, onRetour, onRealisations }: Props) {
  const [intervenant, setIntervenant] = useState('');
  useEffect(() => { lireIntervenant().then((v) => setIntervenant((actuel) => actuel || v)); }, []);
  const bilan = useMemo(() => bilanTournee(photosTournee, intervenant.trim()), [photosTournee, intervenant]);

  const [zip, setZip] = useState<File | null>(null);
  const [prepare, setPrepare] = useState<{ r: Rapport; f: File } | null>(null);
  const [zipEnvoye, setZipEnvoye] = useState(false);
  const [pdf, setPdf] = useState<{ f: File; r: Rapport } | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ txt: string; cls: string } | null>(null);
  const vide = photosTournee.length === 0;

  const verifierNom = () => {
    if (intervenant.trim()) return true;
    setMessage({ txt: "Indiquez le nom de l'intervenant.", cls: 'rouge' });
    return false;
  };

  const preparerZip = async () => {
    if (!verifierNom()) return;
    setMessage(null);
    setOccupe('zip');
    try {
      await ecrireIntervenant(intervenant.trim());
      // Le rapport PDF est établi dès maintenant et joint au .zip envoyé au responsable
      const maintenant = new Date().toISOString();
      const titre = `Tournee_${intervenant.trim()}_${horodatageFichier(maintenant).slice(0, 8)}`;
      const r: Rapport = { ...bilan, id: horodatageFichier(maintenant), dateISO: maintenant, zipNom: `${nomSur(titre)}.zip`, avancementPlan };
      const f = construirePdf(r, photosTournee, await chargerLogoPdf());
      setPrepare({ r, f });
      setZip(await creerZip(photosTournee, titre, intervenant.trim(), f));
    } catch (e) {
      setMessage({ txt: `Export impossible : ${String(e)}`, cls: 'rouge' });
    } finally {
      setOccupe(null);
    }
  };

  const envoyerZip = async () => {
    if (!zip) return;
    const r = await partagerFichier(zip, 'STATERA PhotoTracker – Photos de site', `Bonjour,\n\nVeuillez trouver ci-joint ${photosTournee.length} photo(s) de site classées par département et par ville, avec un récapitulatif (recapitulatif.csv).\n\nCordialement,\n${intervenant}`);
    if (r !== 'annule') setZipEnvoye(true);
    if (r === 'telechargement') setMessage({ txt: 'Le .zip a été téléchargé : joignez-le à un mail depuis vos Téléchargements.', cls: 'orange' });
  };

  const genererPdf = async () => {
    if (!zip || !verifierNom()) return;
    setOccupe('pdf');
    try {
      if (!prepare) return;
      const { r, f } = prepare;
      await ecrireBlob(`rapport:${r.id}`, f);
      r.pdfUri = `rapport:${r.id}`;
      await ecrireBlob(`zip:${r.id}`, zip);     // conservé pour l'onglet Réalisations
      r.zipCle = `zip:${r.id}`;
      await onCloturer(r);       // les photos de la tournée sont marquées comme clôturées
      setPdf({ f, r });
    } catch (e) {
      setMessage({ txt: `Rapport impossible : ${String(e)}`, cls: 'rouge' });
    } finally {
      setOccupe(null);
    }
  };

  const partagerPdf = (f: File) => partagerFichier(f, 'Rapport de fin de tournée', `Rapport de fin de tournée – ${intervenant}`);


  // Tournée clôturée : écran final
  if (pdf) {
    return (
      <div className="ecran">
        <header className="barre-haut"><button className="lien" onClick={onRetour}>‹ Accueil</button><h1>Tournée clôturée</h1><span style={{ width: 70 }} /></header>
        <main className="contenu">
          <div className="alerte vert">Rapport généré : {pdf.r.nbSites} site(s), {pdf.r.nbPhotos} photo(s), {euros(pdf.r.montant)} validés{pdf.r.nbAVerifier ? `, ${pdf.r.nbAVerifier} photo(s) à vérifier` : ''}.</div>
          <Etape n={3} titre="Déposer le rapport PDF" detail="Choisissez votre outil de reporting dans le menu Partager : Drive, OneDrive, SharePoint, Mail…" />
          <button className="btn plein" onClick={() => partagerPdf(pdf.f)}>Partager / enregistrer le PDF</button>
          <button className="btn contour" onClick={onRealisations}>Voir dans « Réalisations »</button>
          <button className="btn texte" onClick={onRetour}>Terminer</button>
        </main>
      </div>
    );
  }

  return (
    <div className="ecran">
      <header className="barre-haut"><button className="lien" onClick={onRetour}>‹ Retour</button><h1>Fin de tournée</h1><span style={{ width: 70 }} /></header>
      <main className="contenu">
        <label className="champ carte">
          <span>Intervenant</span>
          <input value={intervenant} onChange={(e) => setIntervenant(e.target.value)} placeholder="Nom et prénom" />
        </label>

        <div className="kpis">
          <div className="kpi"><b>{bilan.nbSites}</b><span>sites visités</span></div>
          <div className="kpi"><b>{bilan.nbPhotos}</b><span>photos prises</span></div>
        </div>
        <div className="kpi total"><b>{euros(bilan.montant)}</b><span>{bilan.nbPhotos - (bilan.nbAVerifier ?? 0)} photo(s) validée(s) × {euros(bilan.tarifUnitaire)}</span></div>
        {bilan.nbAVerifier ? (
          <div className="alerte orange">{bilan.nbAVerifier} photo(s) à vérifier par le responsable ({euros(bilan.montantEnAttente ?? 0)}) : non payées tant qu'elles ne sont pas validées.</div>
        ) : null}
        {avancementPlan?.total ? <p className="aide">Avancement du plan de route : <b>{avancementPlan.pct} %</b> ({avancementPlan.faites}/{avancementPlan.total} étapes)</p> : null}
        {!vide && <p className="aide">Du {dateFR(bilan.debutISO)} au {dateFR(bilan.finISO)}</p>}
        {message && <div className={`alerte ${message.cls}`}>{message.txt}</div>}

        <Etape n={1} fait={zipEnvoye} titre="Envoyer les photos (.zip)" detail="Classées par département puis par ville, avec un récapitulatif Excel." />
        {!zip ? (
          <button className="btn plein" disabled={vide || !!occupe} onClick={preparerZip}>{occupe === 'zip' ? 'Préparation du .zip…' : 'Préparer le .zip'}</button>
        ) : (
          <button className={`btn ${zipEnvoye ? 'contour' : 'plein'}`} onClick={envoyerZip}>{zipEnvoye ? 'Renvoyer le .zip' : `Envoyer le .zip par mail (${(zip.size / 1048576).toFixed(1)} Mo)`}</button>
        )}
        {zip && zip.size > 20 * 1048576 && <div className="alerte orange">Fichier volumineux : certaines messageries refusent au-delà de 20-25 Mo. Utilisez les boutons .zip par département dans l'onglet Photos.</div>}

        <Etape n={2} titre="Générer le rapport PDF et clôturer" detail="Disponible une fois le .zip envoyé." />
        <button className="btn plein" disabled={!zipEnvoye || !!occupe} onClick={genererPdf}>{occupe === 'pdf' ? 'Génération…' : 'Générer le rapport PDF'}</button>
        {vide && <p className="aide centre">Aucune photo dans la tournée en cours.</p>}

        {rapports.length > 0 && (
          <button className="btn contour" onClick={onRealisations}>Voir les tournées clôturées ({rapports.length})</button>
        )}
      </main>
    </div>
  );
}

function Etape({ n, titre, detail, fait }: { n: number; titre: string; detail: string; fait?: boolean }) {
  return (
    <div className="etape-num">
      <div className={`pastille ${fait ? 'ok' : ''}`}>{fait ? '✓' : n}</div>
      <div><b>{titre}</b><p className="aide">{detail}</p></div>
    </div>
  );
}
