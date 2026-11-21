// Plan complémentaire : détection des doublons et calcul automatique des dates de passage.
import { ajouterJours, depuisISO, jourISO } from './plan';
import { optimiser } from './itineraire';
import type { EtapePlan } from './types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Une étape du fichier est un doublon d'une étape du plan : même référence de site, ou même adresse et même code postal. */
export function estDoublon(e: EtapePlan, plan: EtapePlan[]): EtapePlan | undefined {
  return plan.find((x) => (e.nom && x.nom && norm(e.nom) === norm(x.nom))
    || (norm(e.adresse) === norm(x.adresse) && e.codePostal.trim() === x.codePostal.trim()));
}

// ---------- Jours ouvrés (week-ends et jours fériés exclus) ----------

/** Dimanche de Pâques (algorithme de Meeus). */
function paques(a: number): string {
  const b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * (a % 19) + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor(((a % 19) + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${a}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** Jours fériés en France métropolitaine pour une année. */
export function joursFeries(a: number): Set<string> {
  const p = paques(a);
  return new Set([
    `${a}-01-01`, ajouterJours(p, 1), `${a}-05-01`, `${a}-05-08`, ajouterJours(p, 39), ajouterJours(p, 50),
    `${a}-07-14`, `${a}-08-15`, `${a}-11-01`, `${a}-11-11`, `${a}-12-25`,
  ]);
}

/** Jours travaillés : samedi et dimanche au choix, jours fériés au choix. */
export type JoursTravailles = { samedi: boolean; dimanche: boolean; feries: boolean };
export const TOUS_LES_JOURS: JoursTravailles = { samedi: true, dimanche: true, feries: false };

export function estOuvre(jour: string, t: JoursTravailles): boolean {
  const j = depuisISO(jour).getDay();
  if ((j === 6 && !t.samedi) || (j === 0 && !t.dimanche)) return false;
  return t.feries || !joursFeries(Number(jour.slice(0, 4))).has(jour);
}

/** Premier jour ouvré à partir de `jour` (inclus). */
export function prochainOuvre(jour: string, t: JoursTravailles): string {
  let d = jour;
  for (let i = 0; i < 30 && !estOuvre(d, t); i++) d = ajouterJours(d, 1);
  return d;
}

/** Date de début proposée : le jour ouvré suivant la dernière journée du plan (au plus tôt demain). */
export function debutPropose(plan: EtapePlan[], t: JoursTravailles): string {
  const demain = ajouterJours(jourISO(new Date()), 1);
  const derniere = plan.map((e) => e.date).filter(Boolean).sort().pop();
  const apres = derniere && derniere >= demain ? ajouterJours(derniere, 1) : demain;
  return prochainOuvre(apres, t);
}

export const MIN_SITES_PAR_JOUR = 30;
export type OptionsDates = { debut: string; parJour: number; jours: JoursTravailles };

/**
 * Attribue une date aux étapes sans date : on les ordonne selon l'itinéraire optimal (sites proches à la suite),
 * puis on les répartit par paquets de `parJour` (30 au minimum) sur les jours travaillés à partir de `debut`.
 * Les étapes doivent déjà être localisées (latitude / longitude) pour un regroupement géographique.
 */
export async function calculerDates(etapes: EtapePlan[], o: OptionsDates): Promise<{ etapes: EtapePlan[]; jours: string[] }> {
  if (!etapes.length) return { etapes, jours: [] };
  const { ordre } = await optimiser(etapes);
  const parJour = Math.max(MIN_SITES_PAR_JOUR, Math.floor(o.parJour));
  const res: EtapePlan[] = [];
  const jours: string[] = [];
  let jour = prochainOuvre(o.debut, o.jours);
  for (let i = 0; i < ordre.length; i += parJour) {
    jours.push(jour);
    ordre.slice(i, i + parJour).forEach((e, k) => res.push({ ...e, date: jour, ordre: k + 1, ordreAuto: true }));
    jour = prochainOuvre(ajouterJours(jour, 1), o.jours);
  }
  return { etapes: res, jours };
}
