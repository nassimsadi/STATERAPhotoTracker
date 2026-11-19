import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cleSite, grouper } from './regroupement';
import { dateFR, horodatageFichier, nomSur } from './format';
import { TARIF_PHOTO_EUR, type PhotoRecord, type Rapport } from './types';

export const estValidee = (p: PhotoRecord) => p.conformite === 'conforme';

export const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Chiffres de la tournée (photos non encore clôturées). */
export function bilanTournee(photos: PhotoRecord[], intervenant: string): Omit<Rapport, 'id' | 'dateISO' | 'zipNom'> {
  const dates = photos.map((p) => p.dateISO).sort();
  const maintenant = new Date().toISOString();
  return {
    intervenant,
    debutISO: dates[0] ?? maintenant,
    finISO: dates[dates.length - 1] ?? maintenant,
    nbPhotos: photos.length,
    nbSites: new Set(photos.map(cleSite)).size,
    nbVilles: new Set(photos.map((p) => `${p.departement}|${p.ville}`)).size,
    nbDepartements: new Set(photos.map((p) => p.departement)).size,
    tarifUnitaire: TARIF_PHOTO_EUR,
    // Seules les photos dont l'adresse est validée sont payées automatiquement.
    montant: photos.filter(estValidee).length * TARIF_PHOTO_EUR,
    nbAVerifier: photos.filter((p) => !estValidee(p)).length,
    montantEnAttente: photos.filter((p) => !estValidee(p)).length * TARIF_PHOTO_EUR,
  };
}

const SARCELLE: [number, number, number] = [46, 94, 88];
const GRIS: [number, number, number] = [107, 114, 112];

/** Construit le rapport PDF (A4). `logo` : image PNG en data URL (facultatif). */
export function construirePdf(r: Rapport, photos: PhotoRecord[], logo?: { dataUrl: string; ratio: number }): File {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 15;

  // En-tête
  if (logo) doc.addImage(logo.dataUrl, 'JPEG', M, 12, 50, 50 / logo.ratio);
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('STATERA Networks', M, 20); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(`Rapport n° ${r.id}`, L - M, 16, { align: 'right' });
  doc.text(`STATERA PhotoTracker · ${dateFR(r.dateISO)}`, L - M, 21, { align: 'right' });
  doc.setDrawColor(...SARCELLE); doc.setLineWidth(0.8); doc.line(M, 27, L - M, 27);

  doc.setTextColor(28, 28, 28); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Rapport de fin de tournée', M, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...GRIS);
  doc.text(`Intervenant : ${r.intervenant}`, M, 45);
  doc.text(`Tournée du ${dateFR(r.debutISO)} au ${dateFR(r.finISO)}`, M, 50.5);

  // Indicateurs
  const kpis: [string, string, boolean][] = [
    [String(r.nbSites), 'sites visités', false],
    [String(r.nbPhotos), 'photos prises', false],
    [r.avancementPlan?.total ? `${r.avancementPlan.pct} %` : `${r.nbVilles}`, r.avancementPlan?.total ? 'avancement du plan' : 'villes', false],
    [euros(r.montant), `${r.nbPhotos - (r.nbAVerifier ?? 0)} validée(s) x ${euros(r.tarifUnitaire)}`, true],
  ];
  const lk = (L - 2 * M - 3 * 4) / 4;
  kpis.forEach(([v, lib, fort], i) => {
    const x = M + i * (lk + 4), y = 57;
    if (fort) { doc.setFillColor(...SARCELLE); doc.roundedRect(x, y, lk, 22, 2, 2, 'F'); }
    else { doc.setDrawColor(221, 227, 225); doc.setLineWidth(0.3); doc.roundedRect(x, y, lk, 22, 2, 2, 'S'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fort ? 15 : 17);
    doc.setTextColor(...(fort ? [255, 255, 255] as [number, number, number] : SARCELLE));
    doc.text(v, x + 4, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(...(fort ? [227, 239, 236] as [number, number, number] : GRIS));
    doc.text(lib, x + 4, y + 17);
  });

  // Détail par site
  const corps: string[][] = [];
  for (const g of grouper(photos)) {
    for (const v of g.villes) {
      const sites = new Map<string, PhotoRecord[]>();
      v.photos.forEach((p) => sites.set(cleSite(p), [...(sites.get(cleSite(p)) ?? []), p]));
      for (const ps of sites.values()) {
        const ok = ps.filter(estValidee).length;
        corps.push([g.departement, v.ville, ps[0].adresse || '-', ok === ps.length ? 'Validée' : `${ps.length - ok} à vérifier`,
          String(ps.length), euros(ok * r.tarifUnitaire)]);
      }
    }
  }
  autoTable(doc, {
    startY: 86,
    margin: { left: M, right: M },
    head: [['Département', 'Ville', 'Site (adresse)', 'Adresse', 'Photos', 'Montant validé']],
    body: corps,
    foot: [['Total validé automatiquement', '', '', '', String(r.nbPhotos), euros(r.montant)]],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [234, 242, 240], textColor: SARCELLE, fontStyle: 'bold' },
    footStyles: { fillColor: SARCELLE, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 3 && String(d.cell.raw) !== 'Validée') d.cell.styles.textColor = [179, 38, 30];
      if (d.section === 'foot' && d.column.index >= 4) d.cell.styles.halign = 'right';
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(9.5); doc.setTextColor(28, 28, 28);
  const conformes = photos.filter(estValidee).length;
  const notes = [
    `Contrôle de position (GPS de l'adresse comparé au GPS du smartphone) : ${conformes} / ${photos.length} photo(s) validée(s) automatiquement.`,
    r.avancementPlan?.total ? `Avancement du plan de route : ${r.avancementPlan.pct} % (${r.avancementPlan.faites} / ${r.avancementPlan.total} étapes réalisées).` : '',
    `Photos transmises dans l'archive : ${r.zipNom}`,
  ].filter(Boolean);
  notes.forEach((t) => { doc.text(doc.splitTextToSize(t, L - 2 * M), M, y); y += 6; });

  // Photos soumises à vérification du responsable
  const aVerifier = photos.filter((p) => !estValidee(p)).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (aVerifier.length) {
    y += 4;
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(179, 38, 30);
    doc.text(`En attente de vérification par le responsable : ${aVerifier.length} photo(s) - ${euros(r.montantEnAttente ?? 0)} non payés à ce stade`, M, y);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: y + 3,
      margin: { left: M, right: M },
      head: [['Date', 'Adresse', 'Ville', 'Motif']],
      body: aVerifier.map((p) => [dateFR(p.dateISO).slice(0, 16), p.adresse, `${p.codePostal} ${p.ville}`, p.motifVerification ?? 'Non vérifiée']),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [253, 236, 234], textColor: [179, 38, 30], fontStyle: 'bold' },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // Signatures
  y += 14;
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
  doc.line(M, y, M + 80, y); doc.line(L - M - 80, y, L - M, y);
  doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text('Signature intervenant', M, y + 5);
  doc.text('Validation STATERA Networks', L - M - 80, y + 5);

  const blob = doc.output('blob');
  return new File([blob], `Rapport_${nomSur(r.intervenant)}_${horodatageFichier(r.dateISO)}.pdf`, { type: 'application/pdf' });
}

/** Charge le logo en data URL pour le PDF. */
export async function chargerLogoPdf(): Promise<{ dataUrl: string; ratio: number } | undefined> {
  try {
    const b = await (await fetch(`${import.meta.env.BASE_URL}logo-statera.png`)).blob();
    // Logo réduit (600 px) sur fond blanc, en JPEG : quelques dizaines de Ko au lieu de 2 Mo
    const bmp = await createImageBitmap(b);
    const c = document.createElement('canvas');
    c.width = 600; c.height = Math.round((600 * bmp.height) / bmp.width);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.9), ratio: bmp.width / bmp.height };
  } catch {
    return undefined;
  }
}
