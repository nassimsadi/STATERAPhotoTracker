import { useMemo, useRef, useState } from 'react';
import { ajouterJours, jourISO, libelleJour, lundi } from './plan';
import { importerFichierPlan } from './importPlan';
import { avancement } from './regroupement';
import { localiserEtapes, optimiserParJour } from './itineraire';
import { calculerDates, debutPropose, estDoublon, MIN_SITES_PAR_JOUR, TOUS_LES_JOURS, type JoursTravailles } from './planification';
import type { EtapePlan, PhotoRecord } from './types';

type Props = {
  plan: EtapePlan[];
  photos: PhotoRecord[];
  onImporter: (p: EtapePlan[]) => void;
  onPhotographier: (e: EtapePlan) => void;
  onSignaler: (e: EtapePlan) => void;
};
type Vue = 'jour' | 'semaine' | 'tout';

export default function Plan({ plan, photos, onImporter, onPhotographier, onSignaler }: Props) {
  const aujourdhui = jourISO(new Date());
  // Vue par défaut : « Jour » si le plan est daté, sinon « Tout ».
  const [vue, setVue] = useState<Vue>(() => (plan.some((e) => e.date) ? 'jour' : 'tout'));
  const [jour, setJour] = useState(() => jourParDefaut(plan, aujourdhui));
  const [info, setInfo] = useState<{ txt: string; cls: string } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [calcul, setCalcul] = useState<string | null>(null);

  const signalees = useMemo(() => new Set(photos.filter((p) => p.signalement && p.etapeId).map((p) => p.etapeId!)), [photos]);
  const nbParEtape = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach((p) => p.etapeId && m.set(p.etapeId, (m.get(p.etapeId) ?? 0) + 1));
    return m;
  }, [photos]);

  // Import en attente de choix : remplacer ou compléter le plan, dates automatiques
  const [attente, setAttente] = useState<{ etapes: EtapePlan[]; nomFichier: string } | null>(null);
  const [mode, setMode] = useState<'ajouter' | 'remplacer'>('ajouter');
  const [autoDates, setAutoDates] = useState(true);
  const [parJour, setParJour] = useState(30);
  const [jours, setJours] = useState<JoursTravailles>(TOUS_LES_JOURS);
  const [debut, setDebut] = useState(() => debutPropose(plan, TOUS_LES_JOURS));

  const importer = async (f?: File) => {
    if (!f) return;
    try {
      const etapes = await importerFichierPlan(f);
      if (!etapes.length) throw new Error('Aucune étape trouvée dans le fichier.');
      setInfo(null);
      // Premier plan, entièrement daté : import direct
      if (!plan.length && etapes.every((e) => e.date)) return appliquerImport(etapes, 'remplacer', false);
      setMode(plan.length ? 'ajouter' : 'remplacer');
      setAutoDates(true);
      setDebut(debutPropose(plan.length ? plan : [], jours));
      setAttente({ etapes, nomFichier: f.name });
    } catch (e) {
      setCalcul(null);
      setInfo({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  /** Applique l'import : remplace ou complète le plan, calcule les dates manquantes, localise et optimise. */
  const appliquerImport = async (fichier: EtapePlan[], m: 'ajouter' | 'remplacer', dates: boolean) => {
    setAttente(null);
    try {
      const base = m === 'ajouter' ? plan : [];
      const doublons = m === 'ajouter' ? fichier.filter((e) => estDoublon(e, plan)) : [];
      // Doublons internes au fichier aussi écartés
      const nouveaux: EtapePlan[] = [];
      for (const e of fichier) if (!doublons.includes(e) && !estDoublon(e, nouveaux)) nouveaux.push(e);
      setCalcul('Localisation des adresses…');
      let localisees = await localiserEtapes(nouveaux, (f, t) => setCalcul(`Localisation des adresses : ${f}/${t}…`));
      let joursCalcules: string[] = [];
      if (dates && localisees.some((e) => !e.date)) {
        setCalcul('Calcul des dates de passage…');
        const r = await calculerDates(localisees.filter((e) => !e.date), { debut, parJour, jours });
        localisees = [...localisees.filter((e) => e.date), ...r.etapes];
        joursCalcules = r.jours;
      }
      setCalcul('Calcul des itinéraires par la route…');
      const { plan: optimise, source } = await optimiserParJour([...base, ...localisees]);
      onImporter(optimise);
      setCalcul(null);
      setJour(jourParDefaut(optimise, aujourdhui));
      setVue(optimise.some((e) => e.date) ? 'jour' : 'tout');
      const nonLoc = localisees.filter((e) => e.nonLocalisee).length;
      const sansDate = localisees.filter((e) => !e.date).length;
      const dts = localisees.map((e) => e.date).filter(Boolean).sort();
      setInfo({
        txt: (m === 'ajouter' ? `Plan complété : ${localisees.length} site(s) ajouté(s)` : `Plan importé : ${localisees.length} site(s)`)
          + (doublons.length ? `, ${doublons.length} déjà présent(s) ignoré(s)` : '')
          + (dts.length ? (dts[0] === dts[dts.length - 1] ? `, le ${libelleJour(dts[0])}` : `, du ${libelleJour(dts[0])} au ${libelleJour(dts[dts.length - 1])}`) : '')
          + (joursCalcules.length ? ` · dates calculées sur ${joursCalcules.length} jour(s) de tournée` : '')
          + (sansDate ? ` · ${sansDate} sans date (affichées chaque jour)` : '')
          + (source === 'vol d\'oiseau' ? ' · ordre approximatif (calcul routier indisponible)' : ' · ordre de passage optimisé par la route')
          + (nonLoc ? ` · ${nonLoc} adresse(s) introuvable(s), à vérifier` : ''),
        cls: nonLoc ? 'orange' : 'vert',
      });
    } catch (e) {
      setCalcul(null);
      setInfo({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  const panneauImport = attente && (() => {
    const fichier = attente.etapes;
    const doublons = mode === 'ajouter' ? fichier.filter((e) => estDoublon(e, plan)).length : 0;
    const aAjouter = fichier.length - doublons;
    const sansDate = (mode === 'ajouter' ? fichier.filter((e) => !estDoublon(e, plan)) : fichier).filter((e) => !e.date).length;
    const nbJours = Math.ceil(sansDate / Math.max(MIN_SITES_PAR_JOUR, parJour));
    return (
      <div className="carte panneau-import">
        <h3>Importer « {attente.nomFichier} »</h3>
        <p className="aide">{fichier.length} site(s) dans le fichier{plan.length ? ` · plan actuel : ${plan.length} site(s)` : ''}.</p>
        {plan.length > 0 && (
          <div className="choix">
            <label className="case"><input type="radio" checked={mode === 'ajouter'} onChange={() => setMode('ajouter')} />
              <span><b>Ajouter au plan (plan complémentaire)</b><small>{aAjouter} nouveau(x) site(s){doublons ? `, ${doublons} déjà présent(s) ignoré(s)` : ''}. Les photos déjà prises restent associées.</small></span></label>
            <label className="case"><input type="radio" checked={mode === 'remplacer'} onChange={() => setMode('remplacer')} />
              <span><b>Remplacer le plan</b><small>Le plan actuel est effacé (les photos déjà prises sont conservées).</small></span></label>
          </div>
        )}
        {sansDate > 0 && (
          <div className="dates-auto">
            <label className="case"><input type="checkbox" checked={autoDates} onChange={(e) => setAutoDates(e.target.checked)} />
              <span><b>Calculer automatiquement les dates</b><small>{sansDate} site(s) sans date : regroupés par proximité et répartis jour par jour.</small></span></label>
            {autoDates && (
              <div className="ligne-champs">
                <label className="champ" style={{ flex: 1 }}><span>Sites par jour (min. {MIN_SITES_PAR_JOUR})</span>
                  <input type="number" min={MIN_SITES_PAR_JOUR} max={300} inputMode="numeric" value={parJour}
                    onChange={(e) => setParJour(Number(e.target.value) || MIN_SITES_PAR_JOUR)}
                    onBlur={() => setParJour((v) => Math.min(300, Math.max(MIN_SITES_PAR_JOUR, v)))} /></label>
                <label className="champ" style={{ flex: 1.3 }}><span>À partir du</span>
                  <input type="date" value={debut} onChange={(e) => e.target.value && setDebut(e.target.value)} /></label>
              </div>
            )}
            {autoDates && (
              <div className="jours-travailles">
                <label className="case"><input type="checkbox" checked={jours.samedi} onChange={(e) => setJours({ ...jours, samedi: e.target.checked })} /><span>Samedi travaillé</span></label>
                <label className="case"><input type="checkbox" checked={jours.dimanche} onChange={(e) => setJours({ ...jours, dimanche: e.target.checked })} /><span>Dimanche travaillé</span></label>
                <label className="case"><input type="checkbox" checked={jours.feries} onChange={(e) => setJours({ ...jours, feries: e.target.checked })} /><span>Jours fériés travaillés</span></label>
              </div>
            )}
            {autoDates && <p className="aide">≈ {nbJours} jour(s) de tournée à partir du {libelleJour(debut)}</p>}
          </div>
        )}
        <div className="actions">
          <button className="btn contour petit" onClick={() => setAttente(null)}>Annuler</button>
          <button className="btn plein petit" onClick={() => appliquerImport(fichier, mode, autoDates)}>
            {mode === 'ajouter' ? 'Ajouter au plan' : 'Importer'}</button>
        </div>
      </div>
    );
  })();

  const debutSemaine = lundi(jour);
  const finSemaine = ajouterJours(debutSemaine, 6);
  // Les étapes sans date sont affichées dans toutes les vues.
  const duJour = plan.filter((e) => e.date === jour || !e.date);
  const deLaSemaine = plan.filter((e) => (e.date >= debutSemaine && e.date <= finSemaine) || !e.date);
  const datees = [...new Set(plan.map((e) => e.date).filter(Boolean))].sort();
  const suivante = datees.find((d) => d > (vue === 'semaine' ? finSemaine : jour));
  const precedente = [...datees].reverse().find((d) => d < (vue === 'semaine' ? debutSemaine : jour));
  const visibles = vue === 'jour' ? duJour : vue === 'semaine' ? deLaSemaine : plan;
  const groupes = useMemo(() => {
    const m = new Map<string, EtapePlan[]>();
    visibles.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()]
      .sort(([a], [b]) => (a || '9').localeCompare(b || '9'))
      .map(([d, l]) => [d, [...l].sort((a, b) => a.ordre - b.ordre)] as [string, EtapePlan[]]);
  }, [visibles]);

  const entreeFichier = (
    <input ref={fichier} type="file" hidden
      accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
      onChange={(e) => { importer(e.target.files?.[0]); e.target.value = ''; }} />
  );

  if (!plan.length) {
    return (
      <main className="contenu">
        {entreeFichier}
        <div className="carte">
          <h2>Aucun plan de route</h2>
          <p className="aide">
            Importez le fichier <b>Excel</b> transmis par STATERA Networks. Colonnes reconnues :
            <b> Date, Site, Adresse, Code postal, Ville, Consigne</b> (et facultativement Ordre, Latitude, Longitude).
            Seules Adresse, Code postal et Ville sont obligatoires. Sans colonne Ordre, l'appli calcule l'itinéraire optimal.
          </p>
          {panneauImport}
          {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
          {calcul && <div className="alerte gris">{calcul}</div>}
          <button className="btn plein" onClick={() => fichier.current?.click()}>Importer le plan de route (Excel)</button>
        </div>
      </main>
    );
  }

  const decaler = (n: number) => setJour(ajouterJours(jour, vue === 'semaine' ? 7 * n : n));

  return (
    <main className="contenu">
      {entreeFichier}
      {panneauImport}
      {calcul && !attente && <div className="alerte gris">{calcul}</div>}
      <div className="carte">
        <h3>Avancement du plan de route</h3>
        <Barre libelle={vue === 'jour' ? 'Ce jour' : 'Jour sélectionné'} st={avancement(duJour, photos)} />
        <Barre libelle="Semaine" st={avancement(deLaSemaine, photos)} />
        <Barre libelle="Plan complet" st={avancement(plan, photos)} fort />
      </div>

      <div className="segment">
        {(['jour', 'semaine', 'tout'] as Vue[]).map((v) => (
          <button key={v} className={vue === v ? 'actif' : ''} onClick={() => setVue(v)}>
            {v === 'jour' ? 'Jour' : v === 'semaine' ? 'Semaine' : 'Tout'}
          </button>
        ))}
      </div>

      {vue !== 'tout' && (
        <div className="nav-date">
          <button className="rond" onClick={() => decaler(-1)} aria-label="Précédent">‹</button>
          <button className="titre-date" onClick={() => setJour(aujourdhui)}>
            {vue === 'jour' ? `${jour === aujourdhui ? "Aujourd'hui · " : ''}${libelleJour(jour)}` : `Semaine du ${libelleJour(debutSemaine)}`}
            {jour !== aujourdhui && <small>Toucher pour revenir à aujourd'hui</small>}
          </button>
          <button className="rond" onClick={() => decaler(1)} aria-label="Suivant">›</button>
        </div>
      )}

      {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
      {visibles.length === 0 && (
        <div className="carte">
          <p className="aide centre">Aucune étape prévue {vue === 'semaine' ? 'cette semaine' : 'ce jour'}.</p>
          {suivante && <button className="btn plein petit" onClick={() => setJour(suivante)}>Étapes suivantes : {libelleJour(suivante)} ›</button>}
          {precedente && <button className="btn contour petit" onClick={() => setJour(precedente)}>‹ Étapes précédentes : {libelleJour(precedente)}</button>}
          <button className="btn contour petit" onClick={() => setVue('tout')}>Voir tout le plan ({plan.length} étapes)</button>
        </div>
      )}

      {groupes.map(([date, etapes]) => (
        <section key={date || 'sans'}>
          {(vue !== 'jour' || !date) && (
            <h4 className="titre-jour">{date ? libelleJour(date) : 'Sans date'} · {avancement(etapes, photos).pct} %</h4>
          )}
          {etapes.map((e) => {
            const nb = nbParEtape.get(e.id) ?? 0;
            return (
              <article key={e.id} className={`carte etape ${nb ? 'faite' : ''}`}>
                <div className="etape-haut">
                  <div className={`num ${nb ? 'ok' : ''} ${signalees.has(e.id) ? 'inexistante' : ''}`}>{signalees.has(e.id) ? '🚫' : nb ? '✓' : e.ordre}</div>
                  <div style={{ flex: 1 }}>
                    {e.nom && <div className="ref">{e.nom}</div>}
                    <div className="gras">{e.adresse || '—'}</div>
                    <div className="aide">{[e.codePostal, e.ville].filter(Boolean).join(' ')}</div>
                    {e.consigne && <div className="consigne">⚠︎ {e.consigne}</div>}
                    {e.nonLocalisee && <div className="consigne">Adresse introuvable : vérifiez-la (itinéraire approximatif).</div>}
                    {signalees.has(e.id) ? <div className="badge-inexistante">🚫 Adresse inexistante signalée</div>
                      : nb > 0 && <div className="fait">{nb} photo{nb > 1 ? 's' : ''} prise{nb > 1 ? 's' : ''}</div>}
                  </div>
                </div>
                <div className="actions">
                  <a className="btn contour petit" href={lienItineraire(e)} target="_blank" rel="noreferrer">Itinéraire</a>
                  <button className="btn plein petit" onClick={() => onPhotographier(e)}>📷 {nb ? 'Encore' : 'Photo'}</button>
                </div>
                {!signalees.has(e.id) && (
                  <button className="lien-petit" onClick={() => onSignaler(e)}>🚫 Signaler une adresse inexistante</button>
                )}
              </article>
            );
          })}
        </section>
      ))}

      <button className="btn contour" onClick={() => fichier.current?.click()}>Importer un plan (complémentaire ou nouveau)</button>
      <button className="btn texte-rouge" onClick={() => {
        if (confirm(`Supprimer tout le plan de route (${plan.length} étapes) ?\n\nLes photos déjà prises sont conservées dans la tournée.`)) {
          onImporter([]);
          setInfo(null);
        }
      }}>🗑 Supprimer le plan de route</button>
    </main>
  );
}

function Barre({ libelle, st, fort }: { libelle: string; st: { total: number; faites: number; pct: number }; fort?: boolean }) {
  return (
    <div className="barre-av">
      <div className="barre-ligne">
        <span className={fort ? 'fort' : ''}>{libelle}</span>
        <span className="pct">{st.pct} % <small>({st.faites}/{st.total})</small></span>
      </div>
      <div className="barre-fond"><div className={`barre-plein ${st.pct === 100 ? 'complet' : ''}`} style={{ width: `${st.pct}%` }} /></div>
    </div>
  );
}

export function lienItineraire(e: EtapePlan) {
  const dest = e.latitude != null && e.longitude != null
    ? `${e.latitude},${e.longitude}`
    : encodeURIComponent([e.adresse, e.codePostal, e.ville].filter(Boolean).join(' '));
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${dest}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Aujourd'hui s'il a des étapes, sinon la prochaine journée planifiée, sinon la dernière. */
export function jourParDefaut(plan: EtapePlan[], aujourdhui: string): string {
  const dates = plan.map((e) => e.date).filter(Boolean).sort();
  if (dates.includes(aujourdhui)) return aujourdhui;
  return dates.find((d) => d > aujourdhui) ?? dates[dates.length - 1] ?? aujourdhui;
}
