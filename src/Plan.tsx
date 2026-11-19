import { useMemo, useRef, useState } from 'react';
import { ajouterJours, jourISO, libelleJour, lundi } from './plan';
import { importerFichierPlan } from './importPlan';
import { avancement } from './regroupement';
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
  const [vue, setVue] = useState<Vue>('jour');
  // Jour affiché par défaut : aujourd'hui s'il a des étapes, sinon la prochaine journée planifiée.
  const [jour, setJour] = useState(() => {
    if (plan.some((e) => e.date === aujourdhui)) return aujourdhui;
    return plan.map((e) => e.date).filter((d) => d > aujourdhui).sort()[0] ?? aujourdhui;
  });
  const [info, setInfo] = useState<{ txt: string; cls: string } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

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
      const premier = etapes.find((e) => e.date >= aujourdhui)?.date ?? etapes[0].date;
      if (premier) setJour(premier);
      setInfo({ txt: `Plan importé : ${etapes.length} étape(s).`, cls: 'vert' });
    } catch (e) {
      setInfo({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  const debutSemaine = lundi(jour);
  const finSemaine = ajouterJours(debutSemaine, 6);
  const duJour = plan.filter((e) => e.date === jour);
  const deLaSemaine = plan.filter((e) => e.date >= debutSemaine && e.date <= finSemaine);
  const visibles = vue === 'jour' ? duJour : vue === 'semaine' ? deLaSemaine : plan;
  const groupes = useMemo(() => {
    const m = new Map<string, EtapePlan[]>();
    visibles.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()].sort(([a], [b]) => (a || '9').localeCompare(b || '9'));
  }, [visibles]);

  const entreeFichier = (
    <input ref={fichier} type="file" hidden
      accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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
            <b> Date, Ordre, Site, Adresse, Code postal, Ville, Latitude, Longitude, Consigne</b>.
            Seules Adresse, Code postal et Ville sont obligatoires.
          </p>
          {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
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

      {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}
      {visibles.length === 0 && <p className="aide centre">Aucune étape prévue sur cette période.</p>}

      {groupes.map(([date, etapes]) => (
        <section key={date || 'sans'}>
          {vue !== 'jour' && (
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
