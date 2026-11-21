// Position du smartphone + Base Adresse Nationale (Géoplateforme IGN, service public gratuit).
import { codeDepartementDepuisCP, libelleDepartement } from './departements';

export type Position = { latitude: number; longitude: number; precision: number; horodatage: number };

/** Écart toléré entre les coordonnées de l'adresse et la position du smartphone. */
export const SEUIL_CONFORMITE_M = 50;
/** Tolérance fixe : la photo doit être prise à 50 m au plus de l'adresse de la feuille de route. */
export const tolerance = (_precision: number | null) => SEUIL_CONFORMITE_M;

const versPosition = (p: GeolocationPosition): Position => ({
  latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy, horodatage: p.timestamp,
});

/** Dernière position connue (partagée entre la carte, la prise de photo et le calcul d'itinéraire). */
let derniere: Position | null = null;

export function suivrePosition(ok: (p: Position) => void, erreur: (msg: string) => void): () => void {
  if (!('geolocation' in navigator)) { erreur("Ce téléphone ne fournit pas de position GPS."); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => { derniere = versPosition(p); ok(derniere); },
    (e) => erreur(e.code === e.PERMISSION_DENIED
      ? 'Localisation refusée : autorisez-la dans les réglages du téléphone.'
      : 'Recherche GPS… placez-vous à l\'extérieur.'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Position actuelle : réutilise la dernière position connue si elle a moins de 30 s. */
export const positionUnique = () => new Promise<Position>((res, rej) => {
  if (derniere && Date.now() - derniere.horodatage < 30000) return res(derniere);
  navigator.geolocation.getCurrentPosition((p) => { derniere = versPosition(p); res(derniere); }, (e) => rej(new Error(e.message)),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
});

// ---------- Géocodage ----------
const SERVEURS = ['https://data.geopf.fr/geocodage', 'https://api-adresse.data.gouv.fr'];

type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | number | undefined> };

async function appeler(chemin: string): Promise<Feature[]> {
  let derniere: unknown;
  for (const base of SERVEURS) {
    try {
      const ctrl = new AbortController();
      const minuteur = setTimeout(() => ctrl.abort(), 10000);   // compatible iOS anciens
      const r = await fetch(`${base}${chemin}`, { signal: ctrl.signal }).finally(() => clearTimeout(minuteur));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()).features ?? []) as Feature[];
    } catch (e) { derniere = e; }
  }
  throw derniere;
}

export type CoordsSite =
  | { etat: 'ok'; latitude: number; longitude: number; libelle: string }
  | { etat: 'introuvable' }
  | { etat: 'hors_ligne' };

/** Coordonnées GPS tirées de l'adresse du site. */
export async function coordsDepuisAdresse(adresse: string, cp: string, ville: string): Promise<CoordsSite> {
  const q = encodeURIComponent([adresse, cp, ville].filter((x) => x.trim()).join(' '));
  const filtre = /^\d{5}$/.test(cp.trim()) ? `&postcode=${cp.trim()}` : '';
  try {
    const [f] = await appeler(`/search/?q=${q}&limit=1${filtre}&index=address`);
    if (!f || Number(f.properties.score ?? 0) < 0.4) return { etat: 'introuvable' };
    const [lon, lat] = f.geometry.coordinates;
    return { etat: 'ok', latitude: lat, longitude: lon, libelle: String(f.properties.label ?? '') };
  } catch {
    return { etat: 'hors_ligne' };
  }
}

/** Adresse la plus proche de la position (pour pré-remplir une photo hors plan). */
export async function adresseDepuisGPS(lat: number, lon: number) {
  try {
    const [f] = await appeler(`/reverse/?lat=${lat}&lon=${lon}&limit=1&index=address`);
    if (!f) return null;
    const p = f.properties;
    const cp = String(p.postcode ?? '');
    const rue = p.housenumber ? `${p.housenumber} ${p.street ?? p.name ?? ''}` : String(p.name ?? p.street ?? '');
    return {
      adresse: rue.trim(),
      codePostal: cp,
      ville: String(p.city ?? ''),
      departement: libelleDepartement(codeDepartementDepuisCP(cp), String(p.context ?? '').split(',')[1]),
    };
  } catch {
    return null;
  }
}
