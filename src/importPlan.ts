import readXlsxFile from 'read-excel-file/browser';
import { contientPlan, decoderTexte, importerLignes, importerPlan } from './plan';
import type { EtapePlan } from './types';

/** Importe un plan de route depuis un fichier Excel (.xlsx) ou CSV. */
export async function importerFichierPlan(f: File): Promise<EtapePlan[]> {
  const nom = f.name.toLowerCase();
  if (nom.endsWith('.xls')) {
    throw new Error("Ancien format Excel (.xls) : ouvrez le fichier dans Excel puis « Enregistrer sous » au format .xlsx.");
  }
  if (nom.endsWith('.csv') || nom.endsWith('.txt') || f.type.startsWith('text/')) {
    return importerPlan(decoderTexte(new Uint8Array(await f.arrayBuffer())));
  }
  let feuilles;
  try {
    feuilles = await readXlsxFile(f);
  } catch {
    throw new Error("Le fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un fichier Excel (.xlsx).");
  }
  // Première feuille qui contient des colonnes Adresse / Ville
  const feuille = feuilles.find((fe) => contientPlan(fe.data as unknown[][])) ?? feuilles[0];
  if (!feuille) throw new Error('Le classeur est vide.');
  return importerLignes(feuille.data as unknown[][]);
}
