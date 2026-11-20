// Rapport final pour le donneur d'ordre : PDF (synthèse, détail par site, planche photos) + dossier .zip livrable.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { dateFR, gpsTexte, horodatageFichier, nomSur } from './format';
import { lireImage, lireImageBrute } from './validationDb';
import { classeurExcel, dateExcel, heure, type Colonne, type Valeur } from './excel';
import { LIBELLE_STATUT, type LigneSite, type PhotoRecue, type StatutSite } from './rapprochement';

export type InfosRapport = {
  donneurOrdre: string;
  reference: string;
  redacteur: string;
  avecPhotos: boolean;
  avecHorsPlan: boolean;
};
type Resultat = ReturnType<typeof import('./rapprochement').rapprocher>;

const SARCELLE: [number, number, number] = [46, 94, 88];
const GRIS: [number, number, number] = [107, 114, 112];
const COULEUR: Record<StatutSite, [number, number, number]> = {
  realise: [42, 138, 85], inexistante: [179, 90, 0], en_attente: [138, 90, 0], a_reprendre: [179, 38, 30], non_realise: [179, 38, 30],
};

/** Vignette JPEG légère (600 px) pour la planche photos. */
async function vignette(p: PhotoRecue): Promise<{ url: string; ratio: number } | null> {
  const b = await lireImage(p.tourneeCle, p.id);
  if (!b) return null;
  const img = await createImageBitmap(b);
  const l = 600, h = Math.round((l * img.height) / img.width);
  const c = document.createElement('canvas');
  c.width = l; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, l, h);
  return { url: c.toDataURL('image/jpeg', 0.6), ratio: img.width / img.height };
}

const periode = (photos: PhotoRecue[]) => {
  const d = photos.map((p) => p.dateISO).sort();
  return d.length ? `du ${dateFR(d[0]).slice(0, 10)} au ${dateFR(d[d.length - 1]).slice(0, 10)}` : '—';
};

export async function construirePdfClient(r: Resultat, infos: InfosRapport, logo?: { dataUrl: string; ratio: number },
  progression?: (t: string) => void): Promise<File> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 15;
  const toutes = [...r.lignes.flatMap((l) => l.photos), ...(infos.avecHorsPlan ? r.horsPlan : [])];
  const maintenant = new Date().toISOString();

  // ---- Page de garde / synthèse ----
  if (logo) doc.addImage(logo.dataUrl, 'JPEG', M, 12, 50, 50 / logo.ratio);
  doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(`Édité le ${dateFR(maintenant).slice(0, 10)}`, L - M, 16, { align: 'right' });
  if (infos.reference) doc.text(`Réf. ${infos.reference}`, L - M, 21, { align: 'right' });
  doc.setDrawColor(...SARCELLE); doc.setLineWidth(0.8); doc.line(M, 27, L - M, 27);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 28, 28);
  doc.text("Rapport d'intervention – relevés photographiques", M, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...GRIS);
  let y = 45;
  for (const t of [
    infos.donneurOrdre && `Donneur d'ordre : ${infos.donneurOrdre}`,
    infos.reference && `Référence : ${infos.reference}`,
    `Période d'intervention : ${periode(toutes)}`,
    infos.redacteur && `Rapport établi par : ${infos.redacteur} – STATERA Networks`,
  ].filter(Boolean) as string[]) { doc.text(t, M, y); y += 5.5; }

  const s = r.synthese;
  const kpis: [string, string, boolean][] = [
    [String(s.prevus), 'sites demandés', false],
    [String(s.realises), 'sites réalisés', false],
    [`${s.taux} %`, 'taux de réalisation', true],
    [String(s.inexistantes), 'adresses inexistantes', false],
    [String(s.aReprendre + s.enAttente), 'à reprendre / en cours', false],
    [String(s.nonRealises), 'non réalisés', false],
  ];
  const lk = (L - 2 * M - 5 * 3) / 6;
  y += 3;
  kpis.forEach(([v, lib, fort], i) => {
    const x = M + i * (lk + 3);
    if (fort) { doc.setFillColor(...SARCELLE); doc.roundedRect(x, y, lk, 20, 2, 2, 'F'); }
    else { doc.setDrawColor(221, 227, 225); doc.setLineWidth(0.3); doc.roundedRect(x, y, lk, 20, 2, 2, 'S'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.setTextColor(...(fort ? [255, 255, 255] as [number, number, number] : SARCELLE));
    doc.text(v, x + 3, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(...(fort ? [227, 239, 236] as [number, number, number] : GRIS));
    doc.text(lib, x + 3, y + 15.5);
  });
  y += 27;

  // ---- Détail par site ----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(28, 28, 28);
  doc.text('Détail par site', M, y);
  autoTable(doc, {
    startY: y + 3, margin: { left: M, right: M },
    head: [['Réf.', 'Adresse', 'Commune', 'Passage', 'Photos', 'Statut']],
    body: r.lignes.map((l) => [l.etape.nom || '-', l.etape.adresse, `${l.etape.codePostal} ${l.etape.ville}`,
      l.datePassage ? dateFR(l.datePassage).slice(0, 10) : '-', String(l.validees.length), LIBELLE_STATUT[l.statut]]),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [234, 242, 240], textColor: SARCELLE },
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 5) return;
      d.cell.styles.fontStyle = 'bold';
      d.cell.styles.textColor = COULEUR[r.lignes[d.row.index].statut];
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ---- Adresses inexistantes constatées sur place ----
  const inex = r.lignes.filter((l) => l.statut === 'inexistante');
  if (inex.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(179, 90, 0);
    doc.text(`Adresses inexistantes constatées sur place (${inex.length})`, M, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: M, right: M },
      head: [['Réf.', 'Adresse demandée', 'Commune', 'Date du constat', 'Constat']],
      body: inex.map((l) => [l.etape.nom || '-', l.etape.adresse, `${l.etape.codePostal} ${l.etape.ville}`,
        l.datePassage ? dateFR(l.datePassage).slice(0, 16) : '-', l.validees.map((p) => p.observation).filter(Boolean).join(' ; ')]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [255, 241, 222], textColor: [138, 75, 0] },
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    doc.text("Photo de l'emplacement jointe dans la planche photographique.", M, y);
    y += 8;
  }

  // ---- Sites non réalisés / à reprendre ----
  const pb = r.lignes.filter((l) => l.statut !== 'realise' && l.statut !== 'inexistante');
  if (pb.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(179, 38, 30);
    doc.text(`Sites non réalisés ou à reprendre (${pb.length})`, M, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: M, right: M },
      head: [['Réf.', 'Adresse', 'Commune', 'Statut', 'Observation']],
      body: pb.map((l) => [l.etape.nom || '-', l.etape.adresse, `${l.etape.codePostal} ${l.etape.ville}`, LIBELLE_STATUT[l.statut],
        l.photos.map((p) => p.commentaire).filter(Boolean).join(' ; ') || (l.statut === 'non_realise' ? 'Aucune photo reçue' : '')]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [253, 236, 234], textColor: [179, 38, 30] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ---- Hors plan ----
  if (infos.avecHorsPlan && r.horsPlan.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(28, 28, 28);
    doc.text(`Relevés hors plan de route (${r.horsPlan.length})`, M, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: M, right: M },
      head: [['Date', 'Adresse', 'Commune', 'GPS']],
      body: r.horsPlan.map((p) => [dateFR(p.dateISO).slice(0, 16), p.adresse, `${p.codePostal} ${p.ville}`, gpsTexte(p.latitude, p.longitude)]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [234, 242, 240], textColor: SARCELLE },
    });
  }

  // ---- Planche photos (sites réalisés) ----
  if (infos.avecPhotos) {
    const realises = r.lignes.filter((l) => l.validees.length);
    const cases: { l: LigneSite; p: PhotoRecue }[] = realises.flatMap((l) => l.validees.slice(0, 2).map((p) => ({ l, p })));
    if (cases.length) {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(28, 28, 28);
      doc.text('Planche photographique', M, 20);
      const lc = (L - 2 * M - 6) / 2, hImg = 62, hCase = hImg + 16;
      let i = 0;
      for (const { l, p } of cases) {
        progression?.(`Préparation des photos : ${i + 1}/${cases.length}…`);
        const pos = i % 6;
        if (i > 0 && pos === 0) doc.addPage();
        const x = M + (pos % 2) * (lc + 6), yy = (i < 6 ? 26 : 16) + Math.floor(pos / 2) * (hCase + 6);
        const v = await vignette(p);
        if (v) {
          const w = Math.min(lc, hImg * v.ratio), h = w / v.ratio;
          doc.addImage(v.url, 'JPEG', x + (lc - w) / 2, yy + (hImg - h) / 2, w, h);
        }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(28, 28, 28);
        doc.text(`${l.etape.nom ? `${l.etape.nom} – ` : ''}${l.etape.adresse}`.slice(0, 70), x, yy + hImg + 5);
        if (p.signalement) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(179, 90, 0);
          doc.text(`ADRESSE INEXISTANTE${p.observation ? ` – ${p.observation}` : ''}`.slice(0, 85), x, yy + hImg + 13.5);
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
        doc.text(`${l.etape.codePostal} ${l.etape.ville} · ${dateFR(p.dateISO).slice(0, 16)} · GPS ${gpsTexte(p.latitude, p.longitude)}`, x, yy + hImg + 9.5);
        i++;
      }
    }
  }

  // Pied de page
  const n = doc.getNumberOfPages();
  for (let pg = 1; pg <= n; pg++) {
    doc.setPage(pg);
    doc.setFontSize(8); doc.setTextColor(...GRIS);
    doc.text(`STATERA Networks · ${infos.donneurOrdre || ''}${infos.reference ? ` · ${infos.reference}` : ''}`, M, 290);
    doc.text(`${pg} / ${n}`, L - M, 290, { align: 'right' });
  }
  const nom = `Rapport_intervention_${nomSur(infos.donneurOrdre || 'client')}${infos.reference ? `_${nomSur(infos.reference)}` : ''}_${horodatageFichier(maintenant).slice(0, 8)}`;
  return new File([doc.output('blob')], `${nom}.pdf`, { type: 'application/pdf' });
}


/** Dossier livrable : rapport PDF + photos validées classées par site + récapitulatif (Excel). */
export async function construireLivrable(r: Resultat, infos: InfosRapport, pdf: File, progression?: (t: string) => void): Promise<File> {
  const zip = new JSZip();
  zip.file(pdf.name, pdf);
  const colonnes: Colonne[] = [
    { titre: 'Réf. site', largeur: 12 }, { titre: 'Adresse', largeur: 32 }, { titre: 'Code postal', largeur: 10 }, { titre: 'Commune', largeur: 18 },
    { titre: 'Date de passage prévue', largeur: 13 }, { titre: 'Statut', largeur: 20 }, { titre: 'Date de passage', largeur: 13 }, { titre: 'Heure', largeur: 8 },
    { titre: 'Photos validées', largeur: 9 }, { titre: 'Latitude', largeur: 11 }, { titre: 'Longitude', largeur: 11 },
    { titre: 'Fichiers', largeur: 60 }, { titre: 'Observation', largeur: 40 },
  ];
  const lignes: Valeur[][] = [];
  let k = 0, sansBrute = 0;
  const total = r.lignes.reduce((t, l) => t + l.validees.length, 0);
  for (const l of r.lignes) {
    const site = `${nomSur(l.etape.nom || l.etape.adresse)}_${nomSur(l.etape.ville)}`;
    const dossier = `Photos_avec_coordonnees/${site}`;
    const fichiers: string[] = [];
    for (const [i, p] of l.validees.entries()) {
      progression?.(`Ajout des photos : ${++k}/${total}…`);
      const b = await lireImage(p.tourneeCle, p.id);
      if (!b) continue;
      const nom = `${horodatageFichier(p.dateISO)}_${i + 1}.jpg`;
      const f = `${dossier}/${nom}`;
      zip.file(f, b);
      fichiers.push(f);
      const brute = await lireImageBrute(p.tourneeCle, p.id);
      if (brute) zip.file(`Photos_sans_coordonnees/${site}/${nom}`, brute); else sansBrute++;
    }
    const p0 = l.validees[0];
    lignes.push([l.etape.nom, l.etape.adresse, l.etape.codePostal, l.etape.ville, dateExcel(l.etape.date), LIBELLE_STATUT[l.statut],
      dateExcel(l.datePassage), heure(l.datePassage), l.validees.length, p0?.latitude, p0?.longitude, fichiers.join(' | '),
      [l.statut === 'inexistante' ? `Constat : ${l.validees.map((p) => p.observation).filter(Boolean).join(' ; ')}` : '',
        ...l.photos.map((p) => p.commentaire)].filter(Boolean).join(' ; ')]);
  }
  if (infos.avecHorsPlan) {
    for (const p of r.horsPlan.filter((x) => x.statut === 'validee' || x.statut === 'validee_auto')) {
      const b = await lireImage(p.tourneeCle, p.id);
      const nom = `${horodatageFichier(p.dateISO)}_${nomSur(p.ville)}.jpg`;
      if (b) zip.file(`Photos_avec_coordonnees/_Hors_plan/${nom}`, b);
      const brute = await lireImageBrute(p.tourneeCle, p.id);
      if (brute) zip.file(`Photos_sans_coordonnees/_Hors_plan/${nom}`, brute);
    }
  }
  zip.file('Recapitulatif_sites.xlsx', await classeurExcel('Sites', colonnes, lignes));
  if (sansBrute) {
    zip.file('Photos_sans_coordonnees/LISEZ-MOI.txt', `${sansBrute} photo(s) prise(s) avant la mise à jour de l'application n'existent qu'avec leurs coordonnées : `
      + 'elles figurent uniquement dans le dossier Photos_avec_coordonnees.\r\n');
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  return new File([blob], pdf.name.replace(/\.pdf$/, '.zip'), { type: 'application/zip' });
}
