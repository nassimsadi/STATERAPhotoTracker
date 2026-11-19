import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dateFR, horodatageFichier, nomSur } from './format';
import { euros } from './rapport';
import { statutFinal, totaux, type TourneeImportee } from './validationDb';
import { TARIF_PHOTO_EUR } from './types';

const SARCELLE: [number, number, number] = [46, 94, 88];
const LIB = { validee_auto: 'Validée (auto)', validee: 'Validée (responsable)', refusee: 'Refusée', en_attente: 'En attente' };

/** Relevé de validation à transmettre (intervenant, comptabilité). */
export function construireReleve(t: TourneeImportee, responsable: string, logo?: { dataUrl: string; ratio: number }): File {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 15;
  const tt = totaux(t, TARIF_PHOTO_EUR);
  const dates = t.photos.map((p) => p.dateISO).sort();
  const maintenant = new Date().toISOString();

  if (logo) doc.addImage(logo.dataUrl, 'PNG', M, 12, 50, 50 / logo.ratio);
  doc.setFontSize(9); doc.setTextColor(107, 114, 112);
  doc.text(`STATERA PhotoTracker · ${dateFR(maintenant)}`, L - M, 16, { align: 'right' });
  doc.setDrawColor(...SARCELLE); doc.setLineWidth(0.8); doc.line(M, 27, L - M, 27);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 28, 28);
  doc.text('Relevé de validation des photos', M, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(107, 114, 112);
  doc.text(`Intervenant : ${t.intervenant}`, M, 45);
  doc.text(`Tournée du ${dateFR(dates[0] ?? t.creeLe)} au ${dateFR(dates[dates.length - 1] ?? t.creeLe)}  ·  Archive : ${t.nomZip}`, M, 50.5);
  doc.text(`Vérifié par : ${responsable}`, M, 56);

  autoTable(doc, {
    startY: 62, margin: { left: M, right: M }, theme: 'grid',
    body: [
      ['Photos reçues', String(tt.total)],
      ['Validées automatiquement (adresse conforme)', String(tt.auto)],
      ['Validées après vérification du responsable', String(tt.manuelles)],
      ['Refusées', String(tt.refusees)],
      ['En attente de décision (non payées)', String(tt.enAttente)],
      [`Montant à payer (${tt.payees} x ${euros(TARIF_PHOTO_EUR)})`, euros(tt.montant)],
    ],
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } },
    didParseCell: (d) => { if (d.row.index === 5) { d.cell.styles.fillColor = SARCELLE; d.cell.styles.textColor = [255, 255, 255]; d.cell.styles.fontStyle = 'bold'; } },
  });

  const detail = t.photos
    .filter((p) => p.conformite !== 'conforme' || t.decisions[p.id])
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .map((p) => {
      const s = statutFinal(t, p);
      return [dateFR(p.dateISO).slice(0, 16), `${p.adresse}, ${p.codePostal} ${p.ville}`, p.motifVerification ?? '-', LIB[s], t.decisions[p.id]?.commentaire ?? ''];
    });
  if (detail.length) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(28, 28, 28);
    doc.text('Détail des photos vérifiées', M, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: M, right: M },
      head: [['Date', 'Adresse', 'Motif du contrôle', 'Décision', 'Commentaire']],
      body: detail,
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [234, 242, 240], textColor: SARCELLE },
      didParseCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 3) return;
        const v = String(d.cell.raw);
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.textColor = v.startsWith('Refusée') ? [179, 38, 30] : v.startsWith('En attente') ? [138, 90, 0] : [42, 138, 85];
      },
    });
  }

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  if (y > 270) { doc.addPage(); y = 30; }
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3); doc.line(L - M - 80, y, L - M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 114, 112);
  doc.text(`Visa du responsable : ${responsable}`, L - M - 80, y + 5);

  return new File([doc.output('blob')], `Releve_validation_${nomSur(t.intervenant)}_${horodatageFichier(maintenant)}.pdf`, { type: 'application/pdf' });
}
