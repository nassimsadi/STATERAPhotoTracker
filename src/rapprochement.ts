// Rapprochement entre le plan de route transmis (commande du donneur d'ordre) et les photos reçues des intervenants.
import { distanceM } from './format';
import { statutFinal, type TourneeImportee } from './validationDb';
import type { EtapePlan, PhotoRecord } from './types';

export type PhotoRecue = PhotoRecord & { tourneeCle: string; intervenant: string; statut: ReturnType<typeof statutFinal>; commentaire?: string };
export type StatutSite = 'realise' | 'inexistante' | 'en_attente' | 'a_reprendre' | 'non_realise';
export type LigneSite = { etape: EtapePlan; photos: PhotoRecue[]; validees: PhotoRecue[]; statut: StatutSite; datePassage: string | null };

export const LIBELLE_STATUT: Record<StatutSite, string> = {
  realise: 'Réalisé', inexistante: 'Adresse inexistante', en_attente: 'En cours de validation', a_reprendre: 'À reprendre', non_realise: 'Non réalisé',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(bis|ter)\b/g, ' $1').replace(/[^a-z0-9]+/g, ' ').trim();
const cleAdresse = (adresse: string, cp: string) => `${norm(adresse)}|${cp.trim()}`;

/** Photos de toutes les tournées choisies, avec leur statut final (validée, refusée…). */
export function photosRecues(tournees: TourneeImportee[]): PhotoRecue[] {
  return tournees.flatMap((t) => t.photos.map((p) => ({
    ...p, tourneeCle: t.cle, intervenant: t.intervenant, statut: statutFinal(t, p), commentaire: t.decisions[p.id]?.commentaire,
  })));
}

/** Associe chaque photo à un site du plan : référence du site, puis adresse, puis position GPS (≤ 150 m). */
export function rapprocher(plan: EtapePlan[], photos: PhotoRecue[]) {
  const parSite = new Map<string, PhotoRecue[]>(plan.map((e) => [e.id, []]));
  const restantes = new Set(photos);
  const affecter = (p: PhotoRecue, e: EtapePlan) => { parSite.get(e.id)!.push(p); restantes.delete(p); };

  // 1. Référence du site (colonne « Site »)
  const parRef = new Map(plan.filter((e) => e.nom).map((e) => [norm(e.nom), e]));
  for (const p of [...restantes]) {
    const e = p.siteRef ? parRef.get(norm(p.siteRef)) : undefined;
    if (e) affecter(p, e);
  }
  // 2. Adresse (adresse d'origine de l'étape si connue, sinon adresse saisie) + code postal
  const parAdresse = new Map(plan.map((e) => [cleAdresse(e.adresse, e.codePostal), e]));
  for (const p of [...restantes]) {
    const [a, cp] = p.etapeAdresse ? p.etapeAdresse.split('|') : [p.adresse, p.codePostal];
    const e = parAdresse.get(cleAdresse(a, cp)) ?? parAdresse.get(cleAdresse(p.adresse, p.codePostal));
    if (e) affecter(p, e);
  }
  // 3. Position : site du plan le plus proche, à moins de 150 m (si le plan a des coordonnées)
  for (const p of [...restantes]) {
    if (p.latitude == null || p.longitude == null) continue;
    let best: EtapePlan | null = null, dmin = 150;
    for (const e of plan) {
      if (e.latitude == null || e.longitude == null) continue;
      // L'adresse de la photo doit être cohérente avec le site (même code postal ou même commune)
      if (p.codePostal.trim() !== e.codePostal.trim() && norm(p.ville) !== norm(e.ville)) continue;
      const d = distanceM(e.latitude, e.longitude, p.latitude, p.longitude);
      if (d < dmin) { dmin = d; best = e; }
    }
    if (best) affecter(p, best);
  }

  const lignes: LigneSite[] = plan.map((e) => {
    const ps = parSite.get(e.id)!.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const validees = ps.filter((p) => p.statut === 'validee' || p.statut === 'validee_auto');
    // Signalement d'adresse inexistante validé par le responsable (et aucune photo « normale » validée)
    const statut: StatutSite = validees.length && validees.every((p) => p.signalement) ? 'inexistante'
      : validees.length ? 'realise'
      : ps.some((p) => p.statut === 'en_attente') ? 'en_attente'
      : ps.length ? 'a_reprendre' : 'non_realise';
    return { etape: e, photos: ps, validees, statut, datePassage: (validees[0] ?? ps[0])?.dateISO ?? null };
  });
  const horsPlan = [...restantes].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const n = (s: StatutSite) => lignes.filter((l) => l.statut === s).length;
  const synthese = {
    prevus: lignes.length, realises: n('realise'), inexistantes: n('inexistante'), enAttente: n('en_attente'), aReprendre: n('a_reprendre'), nonRealises: n('non_realise'),
    taux: lignes.length ? Math.round((n('realise') / lignes.length) * 100) : 0,
    photosValidees: lignes.reduce((t, l) => t + l.validees.length, 0),
    horsPlan: horsPlan.length,
  };
  return { lignes, horsPlan, synthese };
}
