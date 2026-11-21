import { useMemo } from 'react';
import Carte from './Carte';
import { jourISO, libelleJour } from './plan';
import { avancement } from './regroupement';
import type { EtapePlan, PhotoRecord } from './types';

type Props = {
  plan: EtapePlan[];
  photos: PhotoRecord[];
  onVoirJour: (jour: string) => void;
  onPhotographier: (e: EtapePlan) => void;
  lienItineraire: (e: EtapePlan) => string;
};

/** Vue globale de tout le plan importé : chiffres clés, carte de tous les sites, calendrier des tournées. */
export default function VueGlobale({ plan, photos, onVoirJour, onPhotographier, lienItineraire }: Props) {
  const aujourdhui = jourISO(new Date());
  const nb = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach((p) => p.etapeId && m.set(p.etapeId, (m.get(p.etapeId) ?? 0) + 1));
    return m;
  }, [photos]);
  const signalees = useMemo(() => new Set(photos.filter((p) => p.signalement && p.etapeId).map((p) => p.etapeId!)), [photos]);

  const faits = plan.filter((e) => nb.get(e.id)).length;
  const retard = plan.filter((e) => e.date && e.date < aujourdhui && !nb.get(e.id)).length;
  const dates = [...new Set(plan.map((e) => e.date).filter(Boolean))].sort();
  const st = avancement(plan, photos);

  const jours = useMemo(() => {
    const m = new Map<string, EtapePlan[]>();
    plan.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()].sort(([a], [b]) => (a || '9').localeCompare(b || '9'));
  }, [plan]);
  const max = Math.max(1, ...jours.map(([, l]) => l.length));

  return (
    <>
      <div className="kpis kpis-global">
        <div className="kpi"><b>{plan.length}</b><span>sites</span></div>
        <div className="kpi"><b>{dates.length}</b><span>jour(s)</span></div>
        <div className="kpi"><b>{faits}</b><span>faits</span></div>
        <div className="kpi"><b>{plan.length - faits}</b><span>restants</span></div>
      </div>
      <div className="carte">
        <div className="barre-ligne"><span className="fort">Avancement du fichier</span><span className="pct">{st.pct} % <small>({st.faites}/{st.total})</small></span></div>
        <div className="barre-fond"><div className={`barre-plein ${st.pct === 100 ? 'complet' : ''}`} style={{ width: `${st.pct}%` }} /></div>
        <p className="aide" style={{ marginTop: 6 }}>
          {dates.length ? `Du ${libelleJour(dates[0])} au ${libelleJour(dates[dates.length - 1])}` : 'Aucune date'}
          {retard ? ` · ⚠️ ${retard} site(s) en retard` : ''}{signalees.size ? ` · 🚫 ${signalees.size} adresse(s) inexistante(s)` : ''}
        </p>
      </div>

      <Carte etapes={plan} faites={nb} tracer={false} onPhotographier={onPhotographier} lienItineraire={lienItineraire} />
      <p className="aide">Sur la carte : en vert les sites faits, en couleur foncée les sites à faire (numéro = ordre dans la journée).</p>

      <h3 className="section">Calendrier des tournées</h3>
      <ol className="liste-jour calendrier">
        {jours.map(([date, liste]) => {
          const s = avancement(liste, photos);
          const enRetard = date && date < aujourdhui && s.faites < s.total;
          return (
            <li key={date || 'sans'} className={s.pct === 100 ? 'fait' : enRetard ? 'en-retard' : date === aujourdhui ? 'courante' : ''}>
              <button className="jour-ligne" onClick={() => date && onVoirJour(date)}>
                <span className="jour-nom">{date ? libelleJour(date) : 'Sans date'}{date === aujourdhui ? ' · aujourd’hui' : ''}</span>
                <span className="jour-barre"><span style={{ width: `${(liste.length / max) * 100}%` }}><i style={{ width: `${s.pct}%` }} /></span></span>
                <span className="jour-chiffres">{s.faites}/{s.total}{enRetard ? ' ⚠️' : s.pct === 100 ? ' ✓' : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
