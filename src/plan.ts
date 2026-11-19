import type { EtapePlan } from './types';

/** Décode des octets en UTF-8 si valide, sinon en Windows-1252/Latin-1 (CSV Excel français). */
export function decoderTexte(o: Uint8Array): string {
  let utf8 = true;
  for (let i = 0; i < o.length && utf8; ) {
    const b = o[i];
    const n = b < 0x80 ? 0 : b >= 0xc2 && b < 0xe0 ? 1 : b >= 0xe0 && b < 0xf0 ? 2 : b >= 0xf0 && b < 0xf5 ? 3 : -1;
    if (n < 0) { utf8 = false; break; }
    for (let k = 1; k <= n; k++) if (i + k >= o.length || (o[i + k] & 0xc0) !== 0x80) utf8 = false;
    i += n + 1;
  }
  if (utf8) {
    let pct = '';
    for (const b of o) pct += '%' + b.toString(16).padStart(2, '0');
    return decodeURIComponent(pct).replace(/^﻿/, '');
  }
  const cp1252: Record<number, string> = { 0x80: '€', 0x92: '’', 0x9c: 'œ', 0x8c: 'Œ', 0x96: '–', 0x97: '—', 0x85: '…' };
  let s = '';
  for (const b of o) s += cp1252[b] ?? String.fromCharCode(b);
  return s;
}

/** Analyse CSV avec séparateur auto-détecté (; , ou tabulation) et champs entre guillemets. */
export function lireCsv(texte: string): string[][] {
  const premiere = texte.split(/\r?\n/)[0] ?? '';
  const sep = [';', '\t', ','].reduce((a, b) => (premiere.split(b).length > premiere.split(a).length ? b : a));
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = '', guill = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guill) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guill = false;
      else champ += c;
    } else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x.trim())) lignes.push(ligne);
  return lignes;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const ALIAS: Record<keyof Omit<EtapePlan, 'id'>, string[]> = {
  date: ['date', 'jour', 'datedepassage', 'dateintervention', 'dateprevue', 'planification'],
  ordre: ['ordre', 'n', 'no', 'num', 'numero', 'rang', 'etape'],
  nom: ['site', 'nom', 'nomsite', 'reference', 'ref', 'codesite', 'identifiant'],
  adresse: ['adresse', 'adressesite', 'rue', 'voie'],
  codePostal: ['codepostal', 'cp', 'postal'],
  ville: ['ville', 'commune', 'localite'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lon', 'lng', 'long'],
  consigne: ['consigne', 'commentaire', 'note', 'remarque', 'instructions', 'observation'],
};

/** Accepte JJ/MM/AAAA, JJ/MM/AA, JJ-MM-AAAA, AAAA-MM-JJ et les dates Excel (numéro de série). */
export function lireDate(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const a = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

const nombre = (s?: string) => {
  const n = parseFloat((s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Convertit le contenu d'un CSV en étapes. */
export const importerPlan = (texte: string) => importerLignes(lireCsv(texte));

/** Cellule Excel/CSV → texte (les dates Excel deviennent AAAA-MM-JJ). */
export function celluleTexte(c: unknown): string {
  if (c == null) return '';
  if (c instanceof Date) return `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
  return String(c).trim();
}

/** Repère la ligne d'en-tête (dans les 15 premières lignes) : elle contient « Adresse » ou « Ville ». */
function indexEntete(lignes: string[][]): number {
  return lignes.slice(0, 15).findIndex((l) => l.some((h) => ALIAS.adresse.includes(norm(h)) || ALIAS.ville.includes(norm(h))));
}

/** Indique si un tableau ressemble à un plan de route (utile pour choisir la bonne feuille Excel). */
export const contientPlan = (lignes: unknown[][]) => indexEntete(lignes.map((l) => l.map(celluleTexte))) >= 0;

/** Convertit un tableau (feuille Excel ou CSV) en étapes. Lève une erreur explicite si les colonnes sont introuvables. */
export function importerLignes(brut: unknown[][]): EtapePlan[] {
  const tout = brut.map((l) => l.map(celluleTexte));
  const i0 = indexEntete(tout);
  if (i0 < 0) throw new Error('Colonnes non reconnues. Le fichier doit contenir au moins une colonne « Adresse » et une colonne « Ville ».');
  const [entete, ...lignes] = tout.slice(i0);
  const idx = {} as Record<keyof typeof ALIAS, number>;
  (Object.keys(ALIAS) as (keyof typeof ALIAS)[]).forEach((k) => {
    idx[k] = entete.findIndex((h) => ALIAS[k].includes(norm(h)));
  });
  const v = (l: string[], k: keyof typeof ALIAS) => (idx[k] >= 0 ? (l[idx[k]] ?? '').trim() : '');
  return lignes
    .map((l, i) => ({
      id: `${Date.now()}_${i}`,
      ordre: nombre(v(l, 'ordre')) ?? i + 1,
      date: lireDate(v(l, 'date')),
      nom: v(l, 'nom'),
      adresse: v(l, 'adresse'),
      codePostal: v(l, 'codePostal').padStart(v(l, 'codePostal') ? 5 : 0, '0'),
      ville: v(l, 'ville'),
      latitude: nombre(v(l, 'latitude')),
      longitude: nombre(v(l, 'longitude')),
      consigne: v(l, 'consigne'),
    }))
    .filter((e) => e.adresse || e.ville || e.latitude != null)
    .sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.ordre - b.ordre);
}

// ---------- Dates (jour / semaine) ----------
const p2 = (n: number) => String(n).padStart(2, '0');
export const jourISO = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const depuisISO = (s: string) => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
export const ajouterJours = (s: string, n: number) => { const d = depuisISO(s); d.setDate(d.getDate() + n); return jourISO(d); };
/** Lundi de la semaine contenant la date. */
export const lundi = (s: string) => { const d = depuisISO(s); return ajouterJours(s, -((d.getDay() + 6) % 7)); };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const libelleJour = (s: string) => { const d = depuisISO(s); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
