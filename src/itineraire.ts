// Calcul d'itinéraire : localisation des adresses + ordre de passage optimal (plus court chemin).
import { coordsDepuisAdresse } from './geo';
import { distanceM } from './format';
import type { EtapePlan } from './types';

type Point = { latitude: number; longitude: number };
const d = (a: Point, b: Point) => distanceM(a.latitude, a.longitude, b.latitude, b.longitude);

/** Complète les coordonnées manquantes à partir des adresses (Base Adresse Nationale). */
export async function localiserEtapes(etapes: EtapePlan[], progression?: (fait: number, total: number) => void): Promise<EtapePlan[]> {
  const res = etapes.map((e) => ({ ...e }));
  const aFaire = res.filter((e) => e.latitude == null || e.longitude == null);
  let fait = 0;
  progression?.(0, aFaire.length);
  const file = [...aFaire];
  const travailleur = async () => {
    for (let e = file.shift(); e; e = file.shift()) {
      const r = await coordsDepuisAdresse(e.adresse, e.codePostal, e.ville);
      if (r.etat === 'ok') { e.latitude = r.latitude; e.longitude = r.longitude; e.nonLocalisee = false; }
      else if (r.etat === 'introuvable') e.nonLocalisee = true;
      progression?.(++fait, aFaire.length);
    }
  };
  await Promise.all([travailleur(), travailleur(), travailleur(), travailleur()]);
  return res;
}

/** Longueur d'un parcours (départ facultatif). */
function longueur(ordre: Point[], depart?: Point) {
  let t = depart && ordre.length ? d(depart, ordre[0]) : 0;
  for (let i = 1; i < ordre.length; i++) t += d(ordre[i - 1], ordre[i]);
  return t;
}

/** Plus proche voisin depuis un point de départ. */
function plusProcheVoisin<T extends Point>(pts: T[], depart: Point): T[] {
  const reste = [...pts];
  const ordre: T[] = [];
  let cur = depart;
  while (reste.length) {
    let iMin = 0;
    for (let i = 1; i < reste.length; i++) if (d(cur, reste[i]) < d(cur, reste[iMin])) iMin = i;
    cur = reste.splice(iMin, 1)[0];
    ordre.push(cur as T);
  }
  return ordre;
}

/** Amélioration 2-opt (inversion de segments tant que le parcours raccourcit). */
function deuxOpt<T extends Point>(ordre: T[], depart?: Point): T[] {
  let meilleur = [...ordre];
  let lg = longueur(meilleur, depart);
  for (let ameliore = true, tours = 0; ameliore && tours < 50; tours++) {
    ameliore = false;
    for (let i = 0; i < meilleur.length - 1; i++) {
      for (let k = i + 1; k < meilleur.length; k++) {
        const essai = [...meilleur.slice(0, i), ...meilleur.slice(i, k + 1).reverse(), ...meilleur.slice(k + 1)];
        const l = longueur(essai, depart);
        if (l < lg - 1) { meilleur = essai; lg = l; ameliore = true; }
      }
    }
  }
  return meilleur;
}

/**
 * Ordre de passage optimal.
 * - avec un départ (position de l'intervenant) : parcours qui part de ce point ;
 * - sans départ : meilleur parcours ouvert (on essaie chaque étape comme point de départ).
 * Les étapes sans coordonnées sont placées à la fin.
 */
export function optimiser(etapes: EtapePlan[], depart?: Point): { ordre: EtapePlan[]; distanceM: number } {
  const loc = etapes.filter((e) => e.latitude != null && e.longitude != null) as (EtapePlan & Point)[];
  const nonLoc = etapes.filter((e) => e.latitude == null || e.longitude == null);
  let ordre: (EtapePlan & Point)[] = [];
  if (loc.length) {
    if (depart) ordre = deuxOpt(plusProcheVoisin(loc, depart), depart);
    else {
      let best = Infinity;
      for (const s of loc) {
        const o = deuxOpt(plusProcheVoisin(loc, s));
        const l = longueur(o);
        if (l < best) { best = l; ordre = o; }
      }
    }
  }
  return { ordre: [...ordre, ...nonLoc], distanceM: longueur(ordre, depart) };
}

/** Optimise chaque journée du plan (étapes dont l'ordre n'a pas été fourni). */
export function optimiserParJour(plan: EtapePlan[]): EtapePlan[] {
  const jours = new Map<string, EtapePlan[]>();
  plan.forEach((e) => jours.set(e.date, [...(jours.get(e.date) ?? []), e]));
  const res: EtapePlan[] = [];
  for (const etapes of jours.values()) {
    if (etapes.every((e) => !e.ordreAuto)) { res.push(...etapes); continue; }
    optimiser(etapes).ordre.forEach((e, i) => res.push({ ...e, ordre: i + 1 }));
  }
  return res.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.ordre - b.ordre);
}

/** Lien Google Maps : navigation depuis la position actuelle à travers les étapes (9 étapes intermédiaires max). */
export function lienNavigation(etapes: EtapePlan[]): string {
  const p = (e: EtapePlan) => e.latitude != null ? `${e.latitude},${e.longitude}` : [e.adresse, e.codePostal, e.ville].filter(Boolean).join(' ');
  const liste = etapes.slice(0, 10);
  const dest = liste[liste.length - 1];
  const via = liste.slice(0, -1).map(p).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(p(dest))}`
    + (via ? `&waypoints=${encodeURIComponent(via)}` : '');
}
