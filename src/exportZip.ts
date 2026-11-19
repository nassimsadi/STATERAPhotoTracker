import JSZip from 'jszip';
import { lireBlob } from './db';
import { horodatageFichier, nomSur } from './format';
import { classeurExcel, dateExcel, heure, type Colonne, type Valeur } from './excel';
import type { PhotoRecord } from './types';


/**
 * .zip organisé ainsi :
 *   <Departement>/<Ville>/<AAAAMMJJ_hhmmss>_<Ville>.jpg
 *   recapitulatif.xlsx (Excel)
 */
export async function creerZip(photos: PhotoRecord[], titre: string, intervenant = '', rapportPdf?: File): Promise<File> {
  const zip = new JSZip();
  if (rapportPdf) zip.file(rapportPdf.name, rapportPdf);   // rapport de fin de tournée de l'intervenant
  const colonnes: Colonne[] = [
    { titre: 'Département', largeur: 22 }, { titre: 'Ville', largeur: 18 }, { titre: 'Code postal', largeur: 10 },
    { titre: 'Adresse', largeur: 32 }, { titre: 'Réf. site', largeur: 12 }, { titre: 'Date de passage prévue', largeur: 13 },
    { titre: 'Date de passage', largeur: 13 }, { titre: 'Heure', largeur: 8 },
    { titre: 'Latitude smartphone', largeur: 12 }, { titre: 'Longitude smartphone', largeur: 12 }, { titre: 'Précision (m)', largeur: 10 },
    { titre: 'Latitude adresse', largeur: 12 }, { titre: 'Longitude adresse', largeur: 12 }, { titre: 'Écart (m)', largeur: 9 },
    { titre: 'Adresse validée', largeur: 11 }, { titre: 'Motif de vérification', largeur: 34 }, { titre: 'Note', largeur: 24 },
    { titre: 'Fichier', largeur: 50 }, { titre: 'Google Maps', largeur: 40 },
  ];
  const lignes: Valeur[][] = [];
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
      p.departement, p.ville, p.codePostal, p.adresse, p.siteRef ?? '', dateExcel(p.datePrevue), dateExcel(p.dateISO), heure(p.dateISO),
      p.latitude, p.longitude, p.precision != null ? Math.round(p.precision) : null, p.latitudeSite, p.longitudeSite, p.ecartM,
      p.conformite === 'conforme' ? 'Oui' : 'À VÉRIFIER', p.motifVerification ?? '', p.note, chemin,
      p.latitude != null ? `https://maps.google.com/?q=${p.latitude},${p.longitude}` : '',
    ]);
  }
  zip.file('recapitulatif.xlsx', await classeurExcel('Photos', colonnes, lignes));
  // Données lues par l'espace « Validation responsable »
  zip.file('donnees-validation.json', JSON.stringify({ format: 'statera-photos-v1', intervenant, creeLe: new Date().toISOString(), photos: donnees }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  return new File([blob], `${nomSur(titre)}.zip`, { type: 'application/zip' });
}
