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

// ---------- Temps de trajet par la route ----------

/** Matrice des trajets routiers (secondes et mètres) entre tous les points : M[i][j] = trajet de i vers j. */
export type Matrice = { duree: number[][]; distance: number[][]; source: 'OSRM' | 'Valhalla' | 'vol d\'oiseau' };

async function lireJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const BLOC = 50;   // 50 départs × 50 arrivées par requête (limites des services publics)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Assemble une matrice complète à partir de requêtes par blocs. */
async function parBlocs(pts: Point[], bloc: (src: Point[], dst: Point[]) => Promise<{ duree: number[][]; distance: number[][] }>) {
  const n = pts.length;
  const duree = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  const distance = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  for (let i = 0; i < n; i += BLOC) {
    for (let j = 0; j < n; j += BLOC) {
      let r;
      for (let essai = 0; ; essai++) {
        try { r = await bloc(pts.slice(i, i + BLOC), pts.slice(j, j + BLOC)); break; }
        catch (e) {
          // On ne réessaie que si le serveur est saturé (429) ou en erreur temporaire (5xx)
          if (essai >= 2 || !/^HTTP (429|5)/.test(String((e as Error).message))) throw e;
          await pause(1500 * (essai + 1));
        }
      }
      r.duree.forEach((l, a) => l.forEach((v, b) => { duree[i + a][j + b] = v; distance[i + a][j + b] = r.distance[a][b]; }));
      if (n > BLOC) await pause(300);   // ménage les serveurs publics
    }
  }
  return { duree, distance };
}

async function matriceOsrm(pts: Point[]): Promise<Matrice> {
  const m = await parBlocs(pts, async (src, dst) => {
    const coords = [...src, ...dst].map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
    const sources = src.map((_, i) => i).join(';');
    const destinations = dst.map((_, i) => i + src.length).join(';');
    const j = await lireJson(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance&sources=${sources}&destinations=${destinations}`);
    if (j.code !== 'Ok' || !j.durations) throw new Error('OSRM');
    return { duree: j.durations, distance: j.distances };
  });
  return { ...m, source: 'OSRM' };
}

async function matriceValhalla(pts: Point[]): Promise<Matrice> {
  const m = await parBlocs(pts, async (src, dst) => {
    const loc = (l: Point[]) => l.map((p) => ({ lat: p.latitude, lon: p.longitude }));
    const j = await lireJson('https://valhalla1.openstreetmap.de/sources_to_targets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: loc(src), targets: loc(dst), costing: 'auto', units: 'kilometers' }),
    });
    const t = j.sources_to_targets as { time: number | null; distance: number | null }[][];
    if (!t) throw new Error('Valhalla');
    return {
      duree: t.map((l) => l.map((c) => c.time ?? Infinity)),
      distance: t.map((l) => l.map((c) => (c.distance ?? Infinity) * 1000)),
    };
  });
  return { ...m, source: 'Valhalla' };
}

/** Repli si aucun service routier ne répond : distance à vol d'oiseau × 1,3 et 50 km/h (approximation). */
function matriceApprochee(pts: Point[]): Matrice {
  const distance = pts.map((a) => pts.map((b) => d(a, b) * 1.3));
  return { distance, duree: distance.map((l) => l.map((m) => m / (50 / 3.6))), source: 'vol d\'oiseau' };
}

export async function matriceRoutiere(pts: Point[]): Promise<Matrice> {
  if (pts.length < 2 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return matriceApprochee(pts);
  for (const f of [matriceOsrm, matriceValhalla]) {
    try {
      const m = await f(pts);
      // Trajets impossibles (point hors réseau routier) : on remplace par l'approximation
      const approx = matriceApprochee(pts);
      m.duree = m.duree.map((l, i) => l.map((v, j) => (v == null || !Number.isFinite(v) ? approx.duree[i][j] : v)));
      m.distance = m.distance.map((l, i) => l.map((v, j) => (v == null || !Number.isFinite(v) ? approx.distance[i][j] : v)));
      return m;
    } catch { /* service suivant */ }
  }
  return matriceApprochee(pts);
}

// ---------- Ordre optimal sur la matrice (temps de conduite) ----------

/** Coût d'un parcours d'indices (le départ éventuel est l'indice 0, déjà en tête). */
const cout = (o: number[], M: number[][]) => o.reduce((t, v, i) => (i ? t + M[o[i - 1]][v] : t), 0);

/** Plus court chemin ouvert visitant tous les points (exact). Départ fixé si `depart` est fourni. */
function heldKarp(points: number[], M: number[][], depart?: number): number[] {
  const n = points.length;
  if (n <= 1) return points;
  const N = 1 << n;
  const dp = new Float64Array(N * n).fill(Infinity);
  const parent = new Int8Array(N * n).fill(-1);
  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = depart != null ? M[depart][points[j]] : 0;
  for (let mask = 1; mask < N; mask++) {
    for (let j = 0; j < n; j++) {
      const v = dp[mask * n + j];
      if (!(mask & (1 << j)) || v === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const nm = mask | (1 << k), c = v + M[points[j]][points[k]];
        if (c < dp[nm * n + k]) { dp[nm * n + k] = c; parent[nm * n + k] = j; }
      }
    }
  }
  let fin = 0;
  for (let j = 1; j < n; j++) if (dp[(N - 1) * n + j] < dp[(N - 1) * n + fin]) fin = j;
  const ordre: number[] = [];
  for (let mask = N - 1, j = fin; j !== -1;) {
    ordre.push(points[j]);
    const pj = parent[mask * n + j];
    mask &= ~(1 << j);
    j = pj;
  }
  return ordre.reverse();
}

/** Meilleur ordre des indices `points` ; `depart` (indice) fixé en tête s'il est fourni. */
export function meilleurOrdre(points: number[], M: number[][], depart?: number, exactJusqua = 13): number[] {
    // Jusqu'à 13 étapes : solution exacte (programmation dynamique de Held-Karp, instantanée)
  if (points.length <= exactJusqua) return heldKarp(points, M, depart);
  // Au-delà (jusqu'à 100 étapes et plus) : plus proche voisin depuis plusieurs départs + 2-opt + Or-opt
  const departs = depart != null ? [depart] : [...points]
    .sort((x, y) => points.reduce((t, p) => t + M[y][p], 0) - points.reduce((t, p) => t + M[x][p], 0))
    .slice(0, 8);   // les points les plus excentrés sont de bons candidats de départ
  let best: number[] = depart != null ? [depart, ...points] : points, bc = Infinity;
  for (const s0 of departs) {
    const reste = points.filter((x) => x !== s0);
    const chemin = [s0];
    let cur = s0;
    while (reste.length) {
      let iMin = 0;
      for (let i = 1; i < reste.length; i++) if (M[cur][reste[i]] < M[cur][reste[iMin]]) iMin = i;
      cur = reste.splice(iMin, 1)[0];
      chemin.push(cur);
    }
    ameliorer(chemin, M, depart != null);
    const c = cout(chemin, M);
    if (c < bc) { bc = c; best = chemin; }
  }
  // Recherche locale itérée : perturbation « double pont » puis ré-optimisation, pendant ~0,5 s
  const fin = Date.now() + (points.length > 60 ? 800 : 400);
  let graine = 12345;
  const alea = (m: number) => (graine = (graine * 16807) % 2147483647) % m;
  const i0 = depart != null ? 1 : 0;
  while (Date.now() < fin && best.length - i0 >= 8) {
    const P = [...best];
    const m = P.length - i0;
    const c = [alea(m), alea(m), alea(m)].sort((x, y) => x - y).map((v) => v + i0);
    if (c[0] === c[1] || c[1] === c[2]) continue;
    const kick = [...P.slice(0, c[0]), ...P.slice(c[1], c[2]), ...P.slice(c[0], c[1]), ...P.slice(c[2])];
    ameliorer(kick, M, depart != null);
    const cc = cout(kick, M);
    if (cc < bc - 1e-6) { bc = cc; best = kick; }
  }
  return depart != null ? best.slice(1) : best;
}

/** Améliore un chemin ouvert sur place (premier élément figé si `debutFixe`). Coûts asymétriques acceptés. */
function ameliorer(P: number[], M: number[][], debutFixe: boolean) {
  const n = P.length;
  const i0 = debutFixe ? 1 : 0;
  const arc = (a: number, b: number) => (a < 0 || b >= n ? 0 : M[P[a]][P[b]]);
  for (let tours = 0, ameliore = true; ameliore && tours < 200; tours++) {
    ameliore = false;
    // Sommes préfixes : sens direct (F) et inverse (B), pour évaluer une inversion en O(1)
    const F = new Float64Array(n), B = new Float64Array(n);
    for (let t = 1; t < n; t++) { F[t] = F[t - 1] + M[P[t - 1]][P[t]]; B[t] = B[t - 1] + M[P[t]][P[t - 1]]; }
    // 2-opt : inverser P[i..k]
    deux: for (let i = i0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const avant = arc(i - 1, i) + arc(k, k + 1) + (F[k] - F[i]);
        const apres = (i - 1 >= 0 ? M[P[i - 1]][P[k]] : 0) + (k + 1 < n ? M[P[i]][P[k + 1]] : 0) + (B[k] - B[i]);
        if (apres < avant - 1e-6) {
          const seg = P.slice(i, k + 1).reverse();
          P.splice(i, seg.length, ...seg);
          ameliore = true;
          break deux;
        }
      }
    }
    if (ameliore) continue;
    // Or-opt : déplacer un bloc de 1 à 3 étapes ailleurs dans le parcours
    or: for (let L = 1; L <= 3; L++) {
      for (let i = i0; i + L <= n; i++) {
        const a = i - 1, b = i + L;   // voisins du bloc
        const retrait = arc(a, i) + arc(i + L - 1, b) - (a >= 0 && b < n ? M[P[a]][P[b]] : 0);
        for (let j = i0 - 1; j < n; j++) {   // insérer entre P[j] et P[j+1]
          if (j >= a && j <= i + L - 1) continue;
          const g = j >= 0 ? P[j] : -1, h = j + 1 < n ? P[j + 1] : -1;
          const ajout = (g >= 0 ? M[g][P[i]] : 0) + (h >= 0 ? M[P[i + L - 1]][h] : 0) - (g >= 0 && h >= 0 ? M[g][h] : 0);
          if (ajout < retrait - 1e-6) {
            const bloc = P.splice(i, L);
            const pos = j < i ? j + 1 : j + 1 - L;
            P.splice(pos, 0, ...bloc);
            ameliore = true;
            break or;
          }
        }
      }
    }
  }
}

export type Resultat = { ordre: EtapePlan[]; distanceM: number; dureeS: number; source: Matrice['source'] };

/**
 * Ordre de passage minimisant le temps de conduite (par la route).
 * Avec `depart` (position de l'intervenant) le parcours part de ce point. Étapes non localisées : à la fin.
 */
export async function optimiser(etapes: EtapePlan[], depart?: Point): Promise<Resultat> {
  const loc = etapes.filter((e) => e.latitude != null && e.longitude != null) as (EtapePlan & Point)[];
  const nonLoc = etapes.filter((e) => e.latitude == null || e.longitude == null);
  if (!loc.length) return { ordre: nonLoc, distanceM: 0, dureeS: 0, source: 'vol d\'oiseau' };
  const pts: Point[] = depart ? [depart, ...loc] : loc;
  const M = await matriceRoutiere(pts);
  const off = depart ? 1 : 0;
  const idx = loc.map((_, i) => i + off);
  const ordreIdx = meilleurOrdre(idx, M.duree, depart ? 0 : undefined);
  const chemin = depart ? [0, ...ordreIdx] : ordreIdx;
  return {
    ordre: [...ordreIdx.map((i) => loc[i - off]), ...nonLoc],
    distanceM: cout(chemin, M.distance),
    dureeS: cout(chemin, M.duree),
    source: M.source,
  };
}

/** Optimise chaque journée du plan (étapes dont l'ordre n'a pas été fourni). */
export async function optimiserParJour(plan: EtapePlan[]): Promise<{ plan: EtapePlan[]; source: Matrice['source'] | null }> {
  const jours = new Map<string, EtapePlan[]>();
  plan.forEach((e) => jours.set(e.date, [...(jours.get(e.date) ?? []), e]));
  const res: EtapePlan[] = [];
  let source: Matrice['source'] | null = null;
  for (const etapes of jours.values()) {
    if (etapes.every((e) => !e.ordreAuto)) { res.push(...etapes); continue; }
    const r = await optimiser(etapes);
    if (source !== 'vol d\'oiseau') source = r.source;
    r.ordre.forEach((e, i) => res.push({ ...e, ordre: i + 1 }));
  }
  return { plan: res.sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.ordre - b.ordre), source };
}

export const dureeTexte = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

/** Lien Google Maps : navigation depuis la position actuelle à travers les étapes (9 étapes intermédiaires max). */
export function lienNavigation(etapes: EtapePlan[]): string {
  const p = (e: EtapePlan) => e.latitude != null ? `${e.latitude},${e.longitude}` : [e.adresse, e.codePostal, e.ville].filter(Boolean).join(' ');
  const liste = etapes.slice(0, 10);
  const dest = liste[liste.length - 1];
  const via = liste.slice(0, -1).map(p).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(p(dest))}`
    + (via ? `&waypoints=${encodeURIComponent(via)}` : '');
}
