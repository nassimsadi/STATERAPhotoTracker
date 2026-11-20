import { useEffect, useMemo, useRef, useState } from 'react';
import { importerFichierPlan } from './importPlan';
import { chargerLogoPdf } from './rapport';
import { construireLivrable, construirePdfClient } from './rapportClient';
import { LIBELLE_STATUT, photosRecues, rapprocher, type StatutSite } from './rapprochement';
import { partagerFichier } from './partage';
import { dateFR } from './format';
import {
  archiverPdf, chargerInfosClient, chargerPlanClient, enregistrerInfosClient, enregistrerPlanClient, type InfosClient, type TourneeImportee,
} from './validationDb';
import type { EtapePlan } from './types';

type Filtre = 'tous' | 'probleme' | 'realise';

/** Compare le plan de route transmis aux tournées reçues et prépare le rapport final du donneur d'ordre. */
export default function RapportClient({ tournees, onRetour }: { tournees: TourneeImportee[]; onRetour: () => void }) {
  const [plan, setPlan] = useState<EtapePlan[]>([]);
  const [infos, setInfos] = useState<InfosClient>({ donneurOrdre: '', reference: '', redacteur: '', nomFichierPlan: '' });
  const [choisies, setChoisies] = useState<Set<string>>(() => new Set(tournees.map((t) => t.cle)));
  const [avecPhotos, setAvecPhotos] = useState(true);
  const [avecHorsPlan, setAvecHorsPlan] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>('probleme');
  const [etat, setEtat] = useState<string | null>(null);
  const [message, setMessage] = useState<{ txt: string; cls: string } | null>(null);
  const [livrables, setLivrables] = useState<{ pdf: File; zip?: File } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => { chargerPlanClient().then(setPlan); chargerInfosClient().then((v) => setInfos((a) => (a.donneurOrdre || a.reference || a.redacteur ? a : v))); }, []);
  const majInfos = (i: Partial<InfosClient>) => { const n = { ...infos, ...i }; setInfos(n); enregistrerInfosClient(n); setLivrables(null); };

  const resultat = useMemo(
    () => (plan.length ? rapprocher(plan, photosRecues(tournees.filter((t) => choisies.has(t.cle)))) : null),
    [plan, tournees, choisies],
  );

  const importer = async (f?: File) => {
    if (!f) return;
    try {
      const p = await importerFichierPlan(f);
      if (!p.length) throw new Error('Aucun site trouvé dans le fichier.');
      setPlan(p); await enregistrerPlanClient(p); majInfos({ nomFichierPlan: f.name });
      setMessage({ txt: `Plan de route chargé : ${p.length} site(s).`, cls: 'vert' });
    } catch (e) {
      setMessage({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  const generer = async (avecZip: boolean) => {
    if (!resultat) return;
    if (!infos.donneurOrdre.trim()) return setMessage({ txt: "Indiquez le nom du donneur d'ordre.", cls: 'rouge' });
    const pendants = resultat.synthese.enAttente;
    if (pendants && !confirm(`${pendants} site(s) ont encore des photos en attente de votre validation : ils apparaîtront « En cours de validation ». Continuer ?`)) return;
    setMessage(null);
    try {
      const opts = { ...infos, avecPhotos, avecHorsPlan };
      setEtat('Génération du rapport PDF…');
      const pdf = await construirePdfClient(resultat, opts, await chargerLogoPdf(), setEtat);
      await archiverPdf('rapport_client', pdf, `${infos.donneurOrdre}${infos.reference ? ` – ${infos.reference}` : ''} (${resultat.synthese.taux} % réalisé)`);
      const zip = avecZip ? await construireLivrable(resultat, opts, pdf, setEtat) : undefined;
      setLivrables({ pdf, zip });
    } catch (e) {
      setMessage({ txt: `Génération impossible : ${String(e)}`, cls: 'rouge' });
    } finally {
      setEtat(null);
    }
  };

  const texteMail = () => resultat
    ? `Bonjour,\n\nVeuillez trouver ci-joint le rapport d'intervention${infos.reference ? ` (réf. ${infos.reference})` : ''} : `
      + `${resultat.synthese.realises}/${resultat.synthese.prevus} sites réalisés (${resultat.synthese.taux} %).\n\nCordialement,\n${infos.redacteur}\nSTATERA Networks`
    : '';

  const lignes = resultat?.lignes.filter((l) => filtre === 'tous' || (filtre === 'realise' ? l.statut === 'realise' || l.statut === 'inexistante' : l.statut !== 'realise' && l.statut !== 'inexistante')) ?? [];

  return (
    <div className="ecran">
      <header className="barre-haut"><button className="lien" onClick={onRetour}>‹ Retour</button><h1>Rapport donneur d'ordre</h1><span style={{ width: 70 }} /></header>
      <main className="contenu" style={{ paddingBottom: 40 }}>
        <input ref={fichier} type="file" hidden accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => { importer(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="carte">
          <h3>1. Le donneur d'ordre</h3>
          <label className="champ"><span>Donneur d'ordre *</span><input value={infos.donneurOrdre} onChange={(e) => majInfos({ donneurOrdre: e.target.value })} placeholder="Nom du client" /></label>
          <label className="champ"><span>Référence (commande, chantier…)</span><input value={infos.reference} onChange={(e) => majInfos({ reference: e.target.value })} /></label>
          <label className="champ"><span>Rapport établi par</span><input value={infos.redacteur} onChange={(e) => majInfos({ redacteur: e.target.value })} placeholder="Votre nom" /></label>
        </div>

        <div className="carte">
          <h3>2. Le plan de route transmis</h3>
          {plan.length ? <p className="aide">{infos.nomFichierPlan || 'Plan chargé'} : <b>{plan.length} site(s)</b> demandés.</p>
            : <p className="aide">Importez le fichier Excel envoyé aux intervenants (la liste des sites demandés).</p>}
          <button className={`btn ${plan.length ? 'contour' : 'plein'}`} onClick={() => fichier.current?.click()}>{plan.length ? 'Remplacer le plan de route' : 'Importer le plan de route (Excel)'}</button>
        </div>

        <div className="carte">
          <h3>3. Les tournées reçues</h3>
          {tournees.length === 0 && <p className="aide">Aucune tournée importée : importez d'abord les .zip reçus des intervenants.</p>}
          {tournees.map((t) => (
            <label key={t.cle} className="case">
              <input type="checkbox" checked={choisies.has(t.cle)} onChange={(e) => {
                const n = new Set(choisies); if (e.target.checked) n.add(t.cle); else n.delete(t.cle); setChoisies(n); setLivrables(null);
              }} />
              <span>{t.intervenant} · envoyée le {dateFR(t.creeLe).slice(0, 10)} · {t.photos.length} photo(s)</span>
            </label>
          ))}
        </div>

        {message && <div className={`alerte ${message.cls}`}>{message.txt}</div>}

        {resultat && (
          <>
            <h3 className="section">Comparaison plan / réalisé</h3>
            <div className="kpis">
              <div className="kpi"><b>{resultat.synthese.prevus}</b><span>demandés</span></div>
              <div className="kpi"><b>{resultat.synthese.realises}</b><span>réalisés</span></div>
              <div className="kpi"><b>{resultat.synthese.nonRealises + resultat.synthese.aReprendre + resultat.synthese.enAttente}</b><span>restants</span></div>
            </div>
            <div className="kpi total"><b>{resultat.synthese.taux} %</b><span>taux de réalisation</span></div>
            <p className="aide">
              {resultat.synthese.inexistantes} adresse(s) inexistante(s) · {resultat.synthese.nonRealises} non réalisé(s) · {resultat.synthese.aReprendre} à reprendre · {resultat.synthese.enAttente} en cours de validation
              · {resultat.synthese.horsPlan} photo(s) hors plan
            </p>

            <div className="segment">
              <button className={filtre === 'probleme' ? 'actif' : ''} onClick={() => setFiltre('probleme')}>À traiter</button>
              <button className={filtre === 'realise' ? 'actif' : ''} onClick={() => setFiltre('realise')}>Réalisés</button>
              <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>Tous</button>
            </div>
            <ol className="liste-jour">
              {lignes.map((l) => (
                <li key={l.etape.id} className={l.statut === 'realise' ? 'fait' : l.statut === 'inexistante' ? 'inexistante' : ''}>
                  <span className={`pastille-statut ${l.statut}`}>{icone(l.statut)}</span>
                  <span className="liste-texte">
                    <b>{l.etape.nom ? `${l.etape.nom} · ` : ''}{l.etape.adresse}</b>
                    <small>{l.etape.codePostal} {l.etape.ville} · {LIBELLE_STATUT[l.statut]}{l.validees.length ? ` · ${l.validees.length} photo(s)` : ''}
                      {l.datePassage ? ` · ${dateFR(l.datePassage).slice(0, 10)}` : ''}</small>
                  </span>
                </li>
              ))}
              {lignes.length === 0 && <p className="aide centre">Rien à afficher.</p>}
            </ol>

            <div className="carte">
              <h3>4. Rapport final</h3>
              <label className="case"><input type="checkbox" checked={avecPhotos} onChange={(e) => { setAvecPhotos(e.target.checked); setLivrables(null); }} /><span>Inclure la planche photos dans le PDF</span></label>
              <label className="case"><input type="checkbox" checked={avecHorsPlan} onChange={(e) => { setAvecHorsPlan(e.target.checked); setLivrables(null); }} /><span>Inclure les relevés hors plan de route</span></label>
              <p className="aide">Le rapport ne contient aucune information de rémunération des intervenants.</p>
              {etat && <div className="alerte gris">{etat}</div>}
              {!livrables ? (
                <>
                  <button className="btn plein" disabled={!!etat} onClick={() => generer(true)}>Générer le rapport et le dossier photos</button>
                  <button className="btn contour" disabled={!!etat} onClick={() => generer(false)}>Générer le rapport PDF seul</button>
                </>
              ) : (
                <>
                  <button className="btn plein" onClick={() => partagerFichier(livrables.pdf, 'Rapport d\'intervention', texteMail())}>Envoyer le rapport PDF ({taille(livrables.pdf)})</button>
                  {livrables.zip && <button className="btn contour" onClick={() => partagerFichier(livrables.zip!, 'Dossier photos', texteMail())}>Envoyer le dossier complet .zip ({taille(livrables.zip)})</button>}
                  {livrables.zip && livrables.zip.size > 20 * 1048576 && <div className="alerte orange">Le dossier dépasse 20 Mo : déposez-le plutôt sur un Drive / OneDrive et envoyez le lien.</div>}
                  <button className="lien-petit" onClick={() => setLivrables(null)}>Regénérer</button>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const icone = (s: StatutSite) => ({ realise: '✓', inexistante: '🚫', en_attente: '⏳', a_reprendre: '↻', non_realise: '✕' }[s]);
const taille = (f: File) => `${(f.size / 1048576).toFixed(1)} Mo`;
