import { useMemo, useRef, useState } from 'react';
import { ajouterJours, jourISO, libelleJour, lundi } from './plan';
import { importerFichierPlan } from './importPlan';
import { avancement } from './regroupement';
import { dureeTexte, lienNavigation, localiserEtapes, optimiser, optimiserParJour } from './itineraire';
import { positionUnique } from './geo';
import { distanceTexte } from './format';
import type { EtapePlan, PhotoRecord } from './types';

type Props = {
  plan: EtapePlan[];
  photos: PhotoRecord[];
  onImporter: (p: EtapePlan[]) => void;
  onPhotographier: (e: EtapePlan) => void;
};
type Vue = 'jour' | 'semaine' | 'tout';

export default function Plan({ plan, photos, onImporter, onPhotographier }: Props) {
  const aujourdhui = jourISO(new Date());
  // Vue par défaut : « Jour » si le plan est daté, sinon « Tout ».
  const [vue, setVue] = useState<Vue>(() => (plan.some((e) => e.date) ? 'jour' : 'tout'));
  const [jour, setJour] = useState(() => jourParDefaut(plan, aujourdhui));
  const [info, setInfo] = useState<{ txt: string; cls: string } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [calcul, setCalcul] = useState<string | null>(null);

  const nbParEtape = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach((p) => p.etapeId && m.set(p.etapeId, (m.get(p.etapeId) ?? 0) + 1));
    return m;
  }, [photos]);

  const importer = async (f?: File) => {
    if (!f) return;
    try {
      const etapes = await importerFichierPlan(f);
      if (!etapes.length) throw new Error('Aucune étape trouvée dans le fichier.');
      if (plan.length && !confirm(`Remplacer le plan actuel (${plan.length} étapes) par ce fichier (${etapes.length} étapes) ?`)) return;
      onImporter(etapes);
      setJour(jourParDefaut(etapes, aujourdhui));
      setVue(etapes.some((e) => e.date) ? 'jour' : 'tout');
      const dates = etapes.map((e) => e.date).filter(Boolean).sort();
      const sansDate = etapes.length - dates.length;
      const resume = `Plan importé : ${etapes.length} étape(s)`
        + (dates.length ? (dates[0] === dates[dates.length - 1] ? `, le ${libelleJour(dates[0])}` : `, du ${libelleJour(dates[0])} au ${libelleJour(dates[dates.length - 1])}`) : '')
        + (sansDate ? ` · ${sansDate} sans date (affichées chaque jour)` : '');
      setInfo({ txt: resume, cls: 'vert' });
      // Localisation des adresses, puis ordre de passage optimal pour chaque journée sans « Ordre » fourni.
      setCalcul('Localisation des adresses…');
      const localisees = await localiserEtapes(etapes, (f, t) => setCalcul(`Localisation des adresses : ${f}/${t}…`));
      setCalcul('Calcul des itinéraires par la route…');
      const { plan: optimise, source } = await optimiserParJour(localisees);
      onImporter(optimise);
      setCalcul(null);
      const nonLoc = optimise.filter((e) => e.nonLocalisee).length;
      const auto = optimise.some((e) => e.ordreAuto);
      setInfo({
        txt: resume + (auto ? (source === 'vol d\'oiseau' ? ' · ordre approximatif (calcul routier indisponible, relancez 🧭 avec du réseau)' : ' · ordre de passage optimisé par la route') : '')
          + (nonLoc ? ` · ${nonLoc} adresse(s) introuvable(s), à vérifier` : ''),
        cls: nonLoc ? 'orange' : 'vert',
      });
    } catch (e) {
      setCalcul(null);
      setInfo({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  /** Itinéraire optimal depuis la position de l'intervenant, pour les étapes restantes du jour affiché. */
  const itineraireOptimal = async () => {
    const restantes = duJour.filter((e) => !nbParEtape.get(e.id));
    const faites = duJour.filter((e) => nbParEtape.get(e.id)).sort((a, b) => a.ordre - b.ordre);
    if (!restantes.length) return setInfo({ txt: 'Toutes les étapes de ce jour ont déjà été photographiées.', cls: 'vert' });
    try {
      setCalcul('Recherche de votre position…');
      const pos = await positionUnique().catch(() => null);
      setCalcul('Calcul de l\'itinéraire optimal par la route…');
      const localisees = await localiserEtapes(restantes);
      const { ordre, distanceM, dureeS, source } = await optimiser(localisees, pos ?? undefined);
      const nouveauxOrdres = new Map<string, EtapePlan>();
      [...faites, ...ordre].forEach((e, i) => nouveauxOrdres.set(e.id, { ...e, ordre: i + 1, ordreAuto: true }));
      onImporter(plan.map((e) => nouveauxOrdres.get(e.id) ?? e));
      const nonLoc = ordre.filter((e) => e.latitude == null).length;
      setInfo({
        txt: `Itinéraire optimisé${pos ? ' depuis votre position' : ''} : ${ordre.length} étape(s) restante(s), `
          + (source === 'vol d\'oiseau'
            ? `environ ${distanceTexte(distanceM)} (estimation : service d'itinéraire injoignable, vérifiez votre réseau).`
            : `${distanceTexte(distanceM)} et ${dureeTexte(dureeS)} de route.`)
          + (pos ? '' : ' (Position GPS indisponible : départ depuis la première étape.)')
          + (nonLoc ? ` ${nonLoc} adresse(s) introuvable(s) placée(s) à la fin.` : ''),
        cls: 'vert',
      });
    } catch (e) {
      setInfo({ txt: `Calcul impossible : ${e instanceof Error ? e.message : String(e)}`, cls: 'rouge' });
    } finally {
      setCalcul(null);
    }
  };

  const debutSemaine = lundi(jour);
  const finSemaine = ajouterJours(debutSemaine, 6);
  // Les étapes sans date sont affichées dans toutes les vues.
  const duJour = plan.filter((e) => e.date === jour || !e.date);
  const deLaSemaine = plan.filter((e) => (e.date >= debutSemaine && e.date <= finSemaine) || !e.date);
  // Étapes du jour non encore photographiées, dans l'ordre de passage (pour la navigation)
  const restantesDuJour = duJour.filter((e) => !nbParEtape.get(e.id)).sort((a, b) => a.ordre - b.ordre);
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
          {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
          {calcul && <div className="alerte gris">{calcul}</div>}
          <button className="btn plein" onClick={() => fichier.current?.click()}>Importer le plan de route (Excel)</button>
          <a className="btn contour" href={`${import.meta.env.BASE_URL}plan-de-route-modele.xlsx`} download>Télécharger le modèle Excel</a>
        </div>
      </main>
    );
  }

  const decaler = (n: number) => setJour(ajouterJours(jour, vue === 'semaine' ? 7 * n : n));

  return (
    <main className="contenu">
      {entreeFichier}
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

      {vue === 'jour' && duJour.length > 1 && (
        <div className="actions">
          <button className="btn plein petit" disabled={!!calcul} onClick={itineraireOptimal}>🧭 Itinéraire optimal depuis ma position</button>
        </div>
      )}
      {calcul && <div className="alerte gris">{calcul}</div>}
      {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
      {vue === 'jour' && restantesDuJour.length > 0 && (
        <a className="btn contour" href={lienNavigation(restantesDuJour.slice(0, 10))} target="_blank" rel="noreferrer">
          ▶ Navigation : {restantesDuJour.length > 10 ? `10 prochaines étapes (sur ${restantesDuJour.length} restantes)` : `${restantesDuJour.length} étape(s) restante(s)`}
        </a>
      )}
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
                  <div className={`num ${nb ? 'ok' : ''}`}>{nb ? '✓' : e.ordre}</div>
                  <div style={{ flex: 1 }}>
                    {e.nom && <div className="ref">{e.nom}</div>}
                    <div className="gras">{e.adresse || '—'}</div>
                    <div className="aide">{[e.codePostal, e.ville].filter(Boolean).join(' ')}</div>
                    {e.consigne && <div className="consigne">⚠︎ {e.consigne}</div>}
                    {e.nonLocalisee && <div className="consigne">Adresse introuvable : vérifiez-la (itinéraire approximatif).</div>}
                    {nb > 0 && <div className="fait">{nb} photo{nb > 1 ? 's' : ''} prise{nb > 1 ? 's' : ''}</div>}
                  </div>
                </div>
                <div className="actions">
                  <a className="btn contour petit" href={lienItineraire(e)} target="_blank" rel="noreferrer">Itinéraire</a>
                  <button className="btn plein petit" onClick={() => onPhotographier(e)}>📷 {nb ? 'Encore' : 'Photo'}</button>
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <button className="btn contour" onClick={() => fichier.current?.click()}>Importer un nouveau plan (Excel)</button>
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

function lienItineraire(e: EtapePlan) {
  const dest = e.latitude != null && e.longitude != null
    ? `${e.latitude},${e.longitude}`
    : encodeURIComponent([e.adresse, e.codePostal, e.ville].filter(Boolean).join(' '));
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? `https://maps.apple.com/?daddr=${dest}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Aujourd'hui s'il a des étapes, sinon la prochaine journée planifiée, sinon la dernière. */
function jourParDefaut(plan: EtapePlan[], aujourdhui: string): string {
  const dates = plan.map((e) => e.date).filter(Boolean).sort();
  if (dates.includes(aujourdhui)) return aujourdhui;
  return dates.find((d) => d > aujourdhui) ?? dates[dates.length - 1] ?? aujourdhui;
}
