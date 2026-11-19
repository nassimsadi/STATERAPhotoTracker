// Génération de récapitulatifs Excel (.xlsx) : en-tête mis en forme, colonnes dimensionnées, vraies dates.
import writeXlsxFile from 'write-excel-file/browser';
import type { Cell, SheetData } from 'write-excel-file/browser';

export type Colonne = { titre: string; largeur: number };
export type Valeur = string | number | Date | null | undefined;

/** Date « jour » sans décalage de fuseau (cellule Excel au format JJ/MM/AAAA). */
export const dateExcel = (iso?: string | null): Date | null => {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [a, m, j] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); }
  const d = new Date(iso);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};
/** Heure locale « HH:MM » d'un horodatage ISO. */
export const heure = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export async function classeurExcel(feuille: string, colonnes: Colonne[], lignes: Valeur[][]): Promise<Blob> {
  const entete: Cell[] = colonnes.map((c) => ({
    value: c.titre, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#2E5E58', alignVertical: 'center', wrap: true, height: 30,
  }));
  const corps: Cell[][] = lignes.map((l) => l.map((v) => {
    if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy' };
    if (typeof v === 'number') return { value: v, type: Number };
    return v == null || v === '' ? null : { value: String(v), type: String };
  }));
  const donnees: SheetData = [entete, ...corps];
  return writeXlsxFile(donnees, { sheet: feuille, columns: colonnes.map((c) => ({ width: c.largeur })), stickyRowsCount: 1 }).toBlob();
}
