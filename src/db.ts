// Stockage local (IndexedDB) : métadonnées + photos (blobs JPEG) + plan + rapports.
import { createStore, del, get, set } from 'idb-keyval';
import type { EtapePlan, PhotoRecord, Rapport } from './types';

const meta = createStore('statera-photos', 'meta');
const blobs = createStore('statera-photos-blobs', 'blobs');

export const chargerPhotos = async () => (await get<PhotoRecord[]>('photos', meta)) ?? [];
export const enregistrerPhotos = (l: PhotoRecord[]) => set('photos', l, meta);
export const chargerPlan = async () => (await get<EtapePlan[]>('plan', meta)) ?? [];
export const enregistrerPlan = (p: EtapePlan[]) => set('plan', p, meta);
export const chargerRapports = async () => (await get<Rapport[]>('rapports', meta)) ?? [];
export const enregistrerRapports = (r: Rapport[]) => set('rapports', r, meta);
export const lireIntervenant = async () => (await get<string>('intervenant', meta)) ?? '';
export const ecrireIntervenant = (n: string) => set('intervenant', n, meta);

export const lireBlob = (cle: string) => get<Blob>(cle, blobs);
export const ecrireBlob = (cle: string, b: Blob) => set(cle, b, blobs);
export const supprimerBlob = async (cle: string) => { await del(cle, blobs); await del(`${cle}:brute`, blobs); };

/** Demande au navigateur de ne pas effacer les données (important sur iPhone). */
export async function demanderPersistance() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* ignoré */ }
}
