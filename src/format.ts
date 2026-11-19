const p2 = (n: number) => String(n).padStart(2, '0');

export function dateFR(iso: string): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function horodatageFichier(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

export function gpsTexte(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return 'GPS indisponible';
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/** Nettoie un texte pour l'utiliser comme nom de dossier/fichier. */
export function nomSur(s: string): string {
  return (s || 'Inconnu')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'Inconnu';
}

/** Distance en mètres entre deux points GPS (formule de haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 85 m, 1,2 km, 166 km */
export const distanceTexte = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0).replace('.', ',')} km`;
