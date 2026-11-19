// Données de l'espace « Validation responsable » (stockées sur l'appareil du responsable).
import { CLIENT_VIDE, type CoordonneesClient } from './facturation';
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
  for (const pdf of zip.file(/^[^/]+\.pdf$/)) {
    const b = await pdf.async('arraybuffer');
    await archiverPdf('rapport_intervenant', new File([b], pdf.name, { type: 'application/pdf' }),
      `${d.intervenant || 'Intervenant'} – tournée envoyée le ${new Date(d.creeLe).toLocaleDateString('fr-FR')}`);
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

// ---------- Documents PDF (archive du responsable) ----------
export type TypeDocument = 'rapport_intervenant' | 'releve' | 'rapport_client';
export type DocumentPdf = { id: string; type: TypeDocument; nom: string; titre: string; dateISO: string; taille: number };
export const LIBELLE_TYPE: Record<TypeDocument, string> = {
  rapport_intervenant: 'Rapports de fin de tournée (intervenants)',
  releve: 'Relevés de validation',
  rapport_client: "Rapports donneur d'ordre",
};
export const chargerDocuments = async () => (await get<DocumentPdf[]>('documents', meta)) ?? [];
export const lireDocument = (id: string) => get<Blob>(`doc/${id}`, images);

/** Archive un PDF (remplace un document de même nom). */
export async function archiverPdf(type: TypeDocument, f: File, titre: string): Promise<void> {
  const docs = await chargerDocuments();
  const existant = docs.find((d) => d.nom === f.name && d.type === type);
  const id = existant?.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await set(`doc/${id}`, f, images);
  const d: DocumentPdf = { id, type, nom: f.name, titre, dateISO: new Date().toISOString(), taille: f.size };
  await set('documents', [d, ...docs.filter((x) => x.id !== id)], meta);
}

export async function supprimerDocument(id: string) {
  await del(`doc/${id}`, images);
  await set('documents', (await chargerDocuments()).filter((d) => d.id !== id), meta);
}

// ---------- Coordonnées de facturation STATERA (incluses dans les relevés) ----------
export const chargerClientFacturation = async () => ({ ...CLIENT_VIDE, ...((await get<CoordonneesClient>('clientFacturation', meta)) ?? {}) });
export const enregistrerClientFacturation = (c: CoordonneesClient) => set('clientFacturation', c, meta);
