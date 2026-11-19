import type { EtapePlan, PhotoRecord } from './types';

/** Un « site » = l'étape du plan de route, sinon une adresse distincte, sinon un point GPS arrondi (~100 m). */
export function cleSite(p: PhotoRecord): string {
  if (p.etapeId) return `etape:${p.etapeId}`;
  if (p.adresse.trim()) return `${p.adresse}|${p.codePostal}|${p.ville}`.toLowerCase().replace(/\s+/g, ' ').trim();
  if (p.latitude != null && p.longitude != null) return `gps:${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
  return p.id;
}

/** Regroupe : département (trié) → ville (triée) → photos (récentes d'abord). */
export function grouper(liste: PhotoRecord[]) {
  const deps = new Map<string, Map<string, PhotoRecord[]>>();
  for (const r of liste) {
    const villes = deps.get(r.departement) ?? new Map<string, PhotoRecord[]>();
    villes.set(r.ville, [...(villes.get(r.ville) ?? []), r]);
    deps.set(r.departement, villes);
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
  return [...deps.keys()].sort(cmp).map((departement) => {
    const villes = deps.get(departement)!;
    return {
      departement,
      villes: [...villes.keys()].sort(cmp).map((ville) => ({
        ville,
        photos: [...villes.get(ville)!].sort((a, b) => b.dateISO.localeCompare(a.dateISO)),
      })),
    };
  });
}

/** Avancement : une étape est faite dès qu'elle a au moins une photo. */
export function avancement(etapes: EtapePlan[], photos: PhotoRecord[]) {
  const faites = new Set(photos.map((p) => p.etapeId).filter(Boolean));
  const n = etapes.filter((e) => faites.has(e.id)).length;
  return { total: etapes.length, faites: n, pct: etapes.length ? Math.round((n / etapes.length) * 100) : 0 };
}
