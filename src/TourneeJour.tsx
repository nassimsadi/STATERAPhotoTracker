import { useMemo, useState } from 'react';
import Carte from './Carte';
import { inverserParcours, optimiserDepuisPosition } from './actionsTournee';
import { lienNavigation } from './itineraire';
import { jourParDefaut, lienItineraire } from './Plan';
import { ajouterJours, jourISO, libelleJour } from './plan';
import { decalerTournee } from './planification';
import { avancement } from './regroupement';
import type { EtapePlan, PhotoRecord } from './types';

type Props = {
  plan: EtapePlan[];
  photos: PhotoRecord[];
  onMajPlan: (p: EtapePlan[]) => void;
  onPhotographier: (e: EtapePlan) => void;
  onSignaler: (e: EtapePlan) => void;
  onAllerAuPlan: () => void;
};

/** Onglet « Tournée du jour » : carte, parcours optimisé, navigation et prochaine étape. */
export default function TourneeJour({ plan, photos, onMajPlan, onPhotographier, onSignaler, onAllerAuPlan }: Props) {
  const signalees = useMemo(() => new Set(photos.filter((p) => p.signalement && p.etapeId).map((p) => p.etapeId!)), [photos]);
  const aujourdhui = jourISO(new Date());
  const [jour, setJour] = useState(() => jourParDefaut(plan, aujourdhui));
  const [calcul, setCalcul] = useState<string | null>(null);
  const [info, setInfo] = useState<{ txt: string; cls: string } | null>(null);

  const nb = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach((p) => p.etapeId && m.set(p.etapeId, (m.get(p.etapeId) ?? 0) + 1));
    return m;
  }, [photos]);

  const etapes = useMemo(() => plan.filter((e) => e.date === jour || !e.date).sort((a, b) => a.ordre - b.ordre), [plan, jour]);
  const restantes = etapes.filter((e) => !nb.get(e.id));
  const prochaine = restantes[0];
  const st = avancement(etapes, photos);
  const datees = [...new Set(plan.map((e) => e.date).filter(Boolean))].sort();
  const precedente = [...datees].reverse().find((d) => d < jour);
  const suivante = datees.find((d) => d > jour);

  if (!plan.length) {
    return (
      <main className="contenu">
        <div className="carte">
          <h2>Pas de tournée</h2>
          <p className="aide">Importez d'abord le plan de route (fichier Excel) pour afficher la tournée sur la carte.</p>
          <button className="btn plein" onClick={onAllerAuPlan}>Aller au plan de route</button>
        </div>
      </main>
    );
  }

  const optimiserIci = async () => {
    setInfo(null);
    try {
      const r = await optimiserDepuisPosition(plan, etapes, nb, setCalcul);
      onMajPlan(r.plan);
      setInfo({ txt: r.message, cls: 'vert' });
    } catch (e) {
      setInfo({ txt: `Calcul impossible : ${e instanceof Error ? e.message : String(e)}`, cls: 'rouge' });
    } finally {
      setCalcul(null);
    }
  };
  /** Décale la tournée du jour au lendemain (et les suivantes d'un jour). */
  const decaler = () => {
    const faites = new Set(photos.map((p) => p.etapeId).filter(Boolean) as string[]);
    const nb = restantes.filter((e) => e.date).length;
    if (!nb) return setInfo({ txt: 'Aucun site daté à décaler pour ce jour.', cls: 'orange' });
    const demain = ajouterJours(jour, 1);
    if (!confirm(`Décaler la tournée du ${libelleJour(jour)} (${nb} site(s) restant(s)) au ${libelleJour(demain)} ?\n\n`
      + 'Les tournées suivantes sont aussi décalées d\'un jour.')) return;
    onMajPlan(decalerTournee(plan, jour, faites));
    setJour(demain);
    setInfo({ txt: `Tournée décalée au ${libelleJour(demain)} : ${nb} site(s). Les tournées suivantes ont été décalées d'un jour.`, cls: 'vert' });
  };

  const inverser = () => {
    const r = inverserParcours(plan, etapes, nb);
    if (r) { onMajPlan(r.plan); setInfo({ txt: r.message, cls: 'vert' }); }
  };

  return (
    <main className="contenu">
      <div className="nav-date">
        <button className="rond" disabled={!precedente} onClick={() => precedente && setJour(precedente)} aria-label="Tournée précédente">‹</button>
        <button className="titre-date" onClick={() => setJour(jourParDefaut(plan, aujourdhui))}>
          {jour === aujourdhui ? `Aujourd'hui · ${libelleJour(jour)}` : jour > aujourdhui ? `Prochaine tournée · ${libelleJour(jour)}` : libelleJour(jour)}
          {jour !== jourParDefaut(plan, aujourdhui) && <small>Toucher pour revenir à la tournée en cours</small>}
        </button>
        <button className="rond" disabled={!suivante} onClick={() => suivante && setJour(suivante)} aria-label="Tournée suivante">›</button>
      </div>

      <div className="avancement-compact">
        <div className="barre-fond"><div className={`barre-plein ${st.pct === 100 ? 'complet' : ''}`} style={{ width: `${st.pct}%` }} /></div>
        <span className="pct">{st.pct} % · {st.faites}/{st.total} sites</span>
      </div>

      {etapes.length === 0 ? (
        <p className="aide centre">Aucune étape prévue ce jour.</p>
      ) : (
        <>
          <Carte etapes={etapes} faites={nb} tracer onPhotographier={onPhotographier} lienItineraire={lienItineraire} />

          {restantes.length > 1 && (
            <div className="actions">
              <button className="btn plein petit" disabled={!!calcul} onClick={optimiserIci}>🧭 Itinéraire optimal depuis ma position</button>
              <button className="btn contour petit inverser" disabled={!!calcul} onClick={inverser} aria-label="Inverser le sens du parcours">⇅ Inverser</button>
            </div>
          )}
          {calcul && <div className="alerte gris">{calcul}</div>}
          {info && <div className={`alerte ${info.cls}`}>{info.txt}</div>}


          {restantes.length > 0 && (
            <a className="btn contour" href={lienNavigation(restantes.slice(0, 10))} target="_blank" rel="noreferrer">
              ▶ Navigation : {restantes.length > 10 ? `10 prochaines étapes (sur ${restantes.length} restantes)` : `${restantes.length} étape(s) restante(s)`}
            </a>
          )}
          {restantes.some((e) => e.date) && (
            <button className="btn contour" onClick={decaler}>⏭ Décaler la tournée au lendemain</button>
          )}

          {prochaine ? (
            <div className="carte prochaine">
              <div className="etiquette">Prochaine étape · n° {etapes.indexOf(prochaine) + 1}</div>
              {prochaine.nom && <div className="ref">{prochaine.nom}</div>}
              <div className="gras">{prochaine.adresse}</div>
              <div className="aide">{prochaine.codePostal} {prochaine.ville}</div>
              {prochaine.consigne && <div className="consigne">⚠︎ {prochaine.consigne}</div>}
              <div className="actions">
                <a className="btn contour petit" href={lienItineraire(prochaine)} target="_blank" rel="noreferrer">Itinéraire</a>
                <button className="btn plein petit" onClick={() => onPhotographier(prochaine)}>📷 Photo</button>
              </div>
              <button className="lien-petit" onClick={() => onSignaler(prochaine)}>🚫 Signaler une adresse inexistante</button>
            </div>
          ) : (
            <div className="alerte vert">Tournée terminée : toutes les étapes ont été photographiées. Pensez à la « Fin de tournée ».</div>
          )}

          <h3 className="section">Étapes du jour</h3>
          <ol className="liste-jour">
            {etapes.map((e, i) => {
              const n = nb.get(e.id) ?? 0;
              return (
                <li key={e.id} className={n ? 'fait' : e === prochaine ? 'courante' : ''}>
                  <span className={`num ${n ? 'ok' : ''} ${signalees.has(e.id) ? 'inexistante' : ''}`}>{signalees.has(e.id) ? '🚫' : n ? '✓' : i + 1}</span>
                  <span className="liste-texte"><b>{e.adresse}</b><small>{e.codePostal} {e.ville}{e.nom ? ` · ${e.nom}` : ''}{signalees.has(e.id) ? ' · adresse inexistante signalée' : ''}</small></span>
                  <button className="mini" onClick={() => onPhotographier(e)} aria-label="Prendre une photo">📷</button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </main>
  );
}
