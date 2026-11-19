import JSZip from 'jszip';
import { lireBlob } from './db';
import { dateFR, horodatageFichier, nomSur } from './format';
import type { PhotoRecord } from './types';

const csv = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * .zip organisé ainsi :
 *   <Departement>/<Ville>/<AAAAMMJJ_hhmmss>_<Ville>.jpg
 *   recapitulatif.csv (ouvrable dans Excel)
 */
export async function creerZip(photos: PhotoRecord[], titre: string, intervenant = ''): Promise<File> {
  const zip = new JSZip();
  const lignes = [[
    'Département', 'Ville', 'Code postal', 'Adresse', 'Date', 'Latitude smartphone', 'Longitude smartphone', 'Précision (m)',
    'Latitude adresse', 'Longitude adresse', 'Écart (m)', 'Adresse validée', 'Motif de vérification', 'Note', 'Fichier', 'Google Maps',
  ].map(csv).join(';')];
  const noms = new Set<string>();
  const donnees: (PhotoRecord & { cheminZip: string })[] = [];
  for (const p of photos) {
    const blob = await lireBlob(p.id);
    if (!blob) continue;
    const base = `${nomSur(p.departement)}/${nomSur(p.ville)}/${horodatageFichier(p.dateISO)}_${nomSur(p.ville)}`;
    const suffixe = p.conformite === 'conforme' ? '' : '_A_VERIFIER';
    let chemin = `${base}${suffixe}.jpg`;
    for (let i = 2; noms.has(chemin); i++) chemin = `${base}_${i}${suffixe}.jpg`;
    noms.add(chemin);
    zip.file(chemin, blob);
    donnees.push({ ...p, cheminZip: chemin });
    lignes.push([
      p.departement, p.ville, p.codePostal, p.adresse, dateFR(p.dateISO), p.latitude, p.longitude,
      p.precision != null ? Math.round(p.precision) : '', p.latitudeSite, p.longitudeSite, p.ecartM,
      p.conformite === 'conforme' ? 'Oui' : 'À VÉRIFIER', p.motifVerification ?? '', p.note, chemin,
      p.latitude != null ? `https://maps.google.com/?q=${p.latitude},${p.longitude}` : '',
    ].map(csv).join(';'));
  }
  zip.file('recapitulatif.csv', '\uFEFF' + lignes.join('\r\n'));
  // Données lues par l'espace « Validation responsable »
  zip.file('donnees-validation.json', JSON.stringify({ format: 'statera-photos-v1', intervenant, creeLe: new Date().toISOString(), photos: donnees }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  return new File([blob], `${nomSur(titre)}.zip`, { type: 'application/zip' });
}
