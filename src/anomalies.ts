// Détection des photos « inhabituelles » à examiner avant une validation groupée.
import { distanceTexte } from './format';
import type { PhotoRecord } from './types';

/** Raisons pour lesquelles une photo mérite un regard (liste vide = rien d'inhabituel). */
export function anomalies(p: PhotoRecord, toutes: PhotoRecord[]): string[] {
  const r: string[] = [];
  if (p.signalement === 'adresse_inexistante') r.push(`Adresse signalée inexistante par l'intervenant${p.observation ? ` (« ${p.observation} »)` : ''}`);
  if (p.ecartM != null && p.ecartM > 1000) r.push(`Prise à ${distanceTexte(p.ecartM)} de l'adresse`);
  else if (p.ecartM != null && p.ecartM > 300) r.push(`Écart de ${distanceTexte(p.ecartM)} avec l'adresse`);
  if (p.motifVerification?.startsWith('Adresse introuvable')) r.push('Adresse introuvable');
  if (p.latitude == null) r.push('Pas de position GPS');
  if (p.precision != null && p.precision > 100) r.push(`GPS imprécis (±${Math.round(p.precision)} m)`);
  const h = new Date(p.dateISO).getHours();
  if (h < 6 || h >= 21) r.push(`Prise de nuit (${String(h).padStart(2, '0')} h)`);
  if (p.latitude != null && toutes.some((q) => q.id !== p.id && q.latitude === p.latitude && q.longitude === p.longitude
    && `${q.adresse}|${q.codePostal}` !== `${p.adresse}|${p.codePostal}`)) {
    r.push('Même position GPS exacte que la photo d\'un autre site');
  }
  return r;
}
