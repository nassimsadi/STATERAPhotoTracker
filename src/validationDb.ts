// Données de l'espace « Validation responsable » (stockées sur l'appareil du responsable).
import { createStore, del, get, set } from 'idb-keyval';
import JSZip from 'jszip';
import type { PhotoRecord } from './types';

const meta = createStore('statera-validation', 'meta');
const images = createStore('statera-validation-images', 'images');

export type Decision = { statut: 'validee' | 'refusee'; commentaire: string; dateISO: string };
export type TourneeImportee = {
  cle: string;
  intervenant: string;
  creeLe: string;
  nomZip: string;
  photos: PhotoRecord[];
  decisions: Record<string, Decision>;   // id photo → décision du responsable
};

export const chargerTournees = async () => (await get<TourneeImportee[]>('tournees', meta)) ?? [];
export const enregistrerTournees = (t: TourneeImportee[]) => set('tournees', t, meta);
export const lireImage = (cle: string, id: string) => get<Blob>(`${cle}/${id}`, images);
export const supprimerTournee = async (t: TourneeImportee) => Promise.all(t.photos.map((p) => del(`${t.cle}/${p.id}`, images)));

/** Importe le .zip envoyé par un intervenant. */
export async function importerZip(f: File): Promise<TourneeImportee> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(f); } catch { throw new Error("Ce fichier n'est pas un .zip valide."); }
  const json = zip.file('donnees-validation.json');
  if (!json) throw new Error("Ce .zip ne vient pas de l'appli STATERA PhotoTracker (fichier donnees-validation.json absent).");
  const d = JSON.parse(await json.async('string')) as { intervenant: string; creeLe: string; photos: (PhotoRecord & { cheminZip: string })[] };
  const cle = `${d.intervenant}|${d.creeLe}`;
  for (const p of d.photos) {
    const img = zip.file(p.cheminZip);
    if (img) await set(`${cle}/${p.id}`, new Blob([await img.async('arraybuffer')], { type: 'image/jpeg' }), images);
  }
  return { cle, intervenant: d.intervenant || 'Intervenant', creeLe: d.creeLe, nomZip: f.name, photos: d.photos, decisions: {} };
}

/** Statut final d'une photo : décision du responsable, sinon validation automatique, sinon en attente. */
export function statutFinal(t: TourneeImportee, p: PhotoRecord): 'validee_auto' | 'validee' | 'refusee' | 'en_attente' {
  const dec = t.decisions[p.id];
  if (dec) return dec.statut;
  return p.conformite === 'conforme' ? 'validee_auto' : 'en_attente';
}

export function totaux(t: TourneeImportee, tarif: number) {
  const s = t.photos.map((p) => statutFinal(t, p));
  const n = (x: string) => s.filter((v) => v === x).length;
  const payees = n('validee_auto') + n('validee');
  return {
    total: t.photos.length, auto: n('validee_auto'), manuelles: n('validee'), refusees: n('refusee'), enAttente: n('en_attente'),
    aVerifier: t.photos.filter((p) => p.conformite !== 'conforme').length,
    payees, montant: payees * tarif,
  };
}

// ---------- Rapport donneur d'ordre ----------
export const chargerPlanClient = async () => (await get<import('./types').EtapePlan[]>('planClient', meta)) ?? [];
export const enregistrerPlanClient = (p: import('./types').EtapePlan[]) => set('planClient', p, meta);
export type InfosClient = { donneurOrdre: string; reference: string; redacteur: string; nomFichierPlan: string };
export const chargerInfosClient = async () => (await get<InfosClient>('infosClient', meta)) ?? { donneurOrdre: '', reference: '', redacteur: '', nomFichierPlan: '' };
export const enregistrerInfosClient = (i: InfosClient) => set('infosClient', i, meta);
