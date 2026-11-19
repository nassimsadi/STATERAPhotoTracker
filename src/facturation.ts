// Facturation : données du relevé de validation (émis par le responsable) et facture de l'intervenant.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { get, set } from 'idb-keyval';
import { dateFR, nomSur } from './format';

/** Coordonnées de facturation de STATERA (saisies par le responsable, transmises dans chaque relevé). */
export type CoordonneesClient = { raisonSociale: string; adresse: string; codePostal: string; ville: string; siret: string; tva: string; email: string };
export const CLIENT_VIDE: CoordonneesClient = { raisonSociale: 'STATERA Networks', adresse: '', codePostal: '', ville: '', siret: '', tva: '', email: '' };

/** Données lisibles par l'appli, intégrées au PDF du relevé de validation. */
export type DonneesReleve = {
  format: 'statera-releve-v1';
  id: string;
  intervenant: string;
  responsable: string;
  etabliLe: string;
  periode: { debut: string; fin: string };
  archive: string;
  tarif: number;
  nbPayees: number;
  montant: number;
  refusees: number;
  enAttente: number;
  photos: { date: string; ref: string; adresse: string; codePostal: string; ville: string }[];
  client: CoordonneesClient;
};

const MARQUEUR = 'STATERA-RELEVE:';
const versBase64 = (s: string) => { const o = new TextEncoder().encode(s); let b = ''; o.forEach((x) => { b += String.fromCharCode(x); }); return btoa(b); };
const depuisBase64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** Inscrit les données du relevé dans les propriétés du PDF (mots-clés). */
export const integrerDonnees = (doc: jsPDF, d: DonneesReleve) => doc.setProperties({ keywords: MARQUEUR + versBase64(JSON.stringify(d)) });

/** Lit les données d'un relevé de validation PDF. */
export async function lireReleve(f: File): Promise<DonneesReleve> {
  const octets = new Uint8Array(await f.arrayBuffer());
  let texte = '';
  for (let i = 0; i < octets.length; i += 65536) texte += String.fromCharCode(...octets.subarray(i, i + 65536));
  const m = texte.match(/STATERA-RELEVE:([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("Ce PDF n'est pas un relevé de validation STATERA PhotoTracker.");
  const d = JSON.parse(depuisBase64(m[1])) as DonneesReleve;
  if (d.format !== 'statera-releve-v1') throw new Error('Format de relevé non reconnu.');
  return d;
}

// ---------- Côté intervenant ----------

export type ProfilFacturation = {
  nom: string; adresse: string; codePostal: string; ville: string; siret: string;
  regimeTva: 'franchise' | 'tva20'; numeroTva: string; iban: string; bic: string; email: string; telephone: string;
};
export const PROFIL_VIDE: ProfilFacturation = {
  nom: '', adresse: '', codePostal: '', ville: '', siret: '', regimeTva: 'franchise', numeroTva: '', iban: '', bic: '', email: '', telephone: '',
};
export type Facture = { id: string; numero: string; releveId: string; dateISO: string; montantHT: number; montantTTC: number; periode: string; nbPhotos: number };

export const chargerProfil = async () => ({ ...PROFIL_VIDE, ...((await get<ProfilFacturation>('statera-facturation-profil')) ?? {}) });
export const enregistrerProfil = (p: ProfilFacturation) => set('statera-facturation-profil', p);
export const chargerFactures = async () => (await get<Facture[]>('statera-factures')) ?? [];
export const enregistrerFactures = (f: Facture[]) => set('statera-factures', f);
export const lireFacturePdf = (id: string) => get<Blob>(`statera-facture-pdf:${id}`);
export const ecrireFacturePdf = (id: string, b: Blob) => set(`statera-facture-pdf:${id}`, b);

/** Prochain numéro de facture : F-AAAA-0001, F-AAAA-0002… (compteur annuel sur l'appareil). */
export async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();
  const cle = `statera-facture-compteur-${annee}`;
  const n = ((await get<number>(cle)) ?? 0) + 1;
  await set(cle, n);
  return `F-${annee}-${String(n).padStart(4, '0')}`;
}

export const profilIncomplet = (p: ProfilFacturation) =>
  (['nom', 'adresse', 'codePostal', 'ville', 'siret', 'iban'] as const).filter((k) => !p[k].trim())
    .map((k) => ({ nom: 'nom ou raison sociale', adresse: 'adresse', codePostal: 'code postal', ville: 'ville', siret: 'SIRET', iban: 'IBAN' }[k]));

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const SARCELLE: [number, number, number] = [46, 94, 88];

/** Facture PDF de l'intervenant, adressée à STATERA, à partir d'un relevé de validation. */
export function construireFacture(numero: string, p: ProfilFacturation, r: DonneesReleve): { pdf: File; facture: Facture } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 210, M = 15;
  const maintenant = new Date();
  const echeance = new Date(maintenant.getTime() + 30 * 86400000);
  // Prix convenu : 5 € HT par photo validée. TVA 20 % en sus si l'intervenant y est soumis (récupérable par STATERA).
  const soumis = p.regimeTva === 'tva20';
  const ht = Math.round(r.nbPayees * r.tarif * 100) / 100;
  const tva = soumis ? Math.round(ht * 20) / 100 : 0;
  const ttc = Math.round((ht + tva) * 100) / 100;
  const puHT = r.tarif;
  const periode = `du ${dateFR(r.periode.debut).slice(0, 10)} au ${dateFR(r.periode.fin).slice(0, 10)}`;

  // Émetteur
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(28, 28, 28);
  doc.text(p.nom, M, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80, 80, 80);
  [p.adresse, `${p.codePostal} ${p.ville}`, `SIRET : ${p.siret}`, p.regimeTva === 'tva20' && p.numeroTva ? `N° TVA : ${p.numeroTva}` : '',
    p.email, p.telephone].filter(Boolean).forEach((t, i) => doc.text(t, M, 26 + i * 4.6));

  // Titre
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...SARCELLE);
  doc.text('FACTURE', L - M, 22, { align: 'right' });
  doc.setFontSize(10.5); doc.setTextColor(28, 28, 28);
  doc.text(`N° ${numero}`, L - M, 29, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(`Date : ${maintenant.toLocaleDateString('fr-FR')}`, L - M, 34.5, { align: 'right' });
  doc.text(`Échéance : ${echeance.toLocaleDateString('fr-FR')}`, L - M, 39.5, { align: 'right' });

  // Client
  const c = r.client;
  doc.setDrawColor(221, 227, 225); doc.setLineWidth(0.3); doc.roundedRect(L - M - 85, 50, 85, 34, 2, 2, 'S');
  doc.setFontSize(8.5); doc.setTextColor(107, 114, 112); doc.text('FACTURÉ À', L - M - 81, 56);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(28, 28, 28); doc.text(c.raisonSociale || 'STATERA Networks', L - M - 81, 62);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  [c.adresse, [c.codePostal, c.ville].filter(Boolean).join(' '), c.siret ? `SIRET : ${c.siret}` : '', c.tva ? `N° TVA : ${c.tva}` : '']
    .filter(Boolean).forEach((t, i) => doc.text(t, L - M - 81, 67.5 + i * 4.6));

  doc.setFontSize(9.5); doc.setTextColor(80, 80, 80);
  doc.text(`Référence : relevé de validation n° ${r.id} établi le ${dateFR(r.etabliLe).slice(0, 10)} par ${r.responsable}`, M, 95);

  autoTable(doc, {
    startY: 100, margin: { left: M, right: M },
    head: [['Désignation', 'Quantité', 'Prix unitaire HT', 'Total HT']],
    body: [[`Relevés photographiques de sites validés – tournée ${periode}`, String(r.nbPayees),
      eur(puHT), eur(ht)]],
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: SARCELLE, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: y, margin: { left: L - M - 80, right: M }, theme: 'plain',
    body: [
      ['Total HT', eur(ht)],
      [p.regimeTva === 'tva20' ? 'TVA 20 %' : 'TVA', p.regimeTva === 'tva20' ? eur(tva) : '0,00 €'],
      ['Net à payer', eur(ttc)],
    ],
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (d) => { if (d.row.index === 2) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [234, 242, 240]; } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  const mentions = [
    soumis ? `Prix convenu : ${eur(r.tarif)} HT par photo validée, TVA 20 % en sus.` : 'TVA non applicable, art. 293 B du CGI.',
    `Règlement par virement à 30 jours, soit au plus tard le ${echeance.toLocaleDateString('fr-FR')}.`,
    `IBAN : ${p.iban}${p.bic ? `   BIC : ${p.bic}` : ''}`,
    'Escompte pour paiement anticipé : néant. En cas de retard de paiement : pénalités au taux de 3 fois le taux d\'intérêt légal '
      + 'et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 du Code de commerce).',
  ].filter(Boolean);
  mentions.forEach((t) => { const l = doc.splitTextToSize(t, L - 2 * M); doc.text(l, M, y); y += l.length * 4 + 1.5; });

  // Annexe : détail des photos validées
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(28, 28, 28);
  doc.text(`Annexe – détail des ${r.nbPayees} relevé(s) validé(s) (facture ${numero})`, M, 18);
  autoTable(doc, {
    startY: 22, margin: { left: M, right: M },
    head: [['Date', 'Réf.', 'Adresse', 'Commune']],
    body: r.photos.map((x) => [dateFR(x.date).slice(0, 16), x.ref || '-', x.adresse, `${x.codePostal} ${x.ville}`]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [234, 242, 240], textColor: SARCELLE },
  });

  const n = doc.getNumberOfPages();
  for (let pg = 1; pg <= n; pg++) {
    doc.setPage(pg); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`${p.nom} · SIRET ${p.siret} · Facture ${numero}`, M, 290);
    doc.text(`${pg} / ${n}`, L - M, 290, { align: 'right' });
  }
  const pdf = new File([doc.output('blob')], `Facture_${numero}_${nomSur(p.nom)}.pdf`, { type: 'application/pdf' });
  return { pdf, facture: { id: numero, numero, releveId: r.id, dateISO: maintenant.toISOString(), montantHT: ht, montantTTC: ttc, periode, nbPhotos: r.nbPayees } };
}
