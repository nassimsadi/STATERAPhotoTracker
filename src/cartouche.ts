// Composition de la photo finale : image redimensionnée + cartouche d'informations (sans logo).
// Sortie : JPEG, 1600 px sur le grand côté, qualité 0,6 (≈ 200 à 400 Ko).

export const GRAND_COTE = 1600;
export const QUALITE_JPEG = 0.6;

export type InfosCartouche = {
  adresse: string;
  ligneVille: string;      // "33000 Bordeaux · 33 - Gironde"
  gpsAdresse: string;
  gpsSmartphone: string;
  conformite: { texte: string; ok: boolean | null };
  date: string;
  note: string;
};

/** Charge la photo en respectant l'orientation EXIF (photo prise en portrait). */
export async function chargerImage(fichier: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch {
    try { return await createImageBitmap(fichier); } catch { /* iOS < 15 : repli via <img> */ }
    const url = URL.createObjectURL(fichier);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return await createImageBitmap(c).catch(() => c as unknown as ImageBitmap);
    } finally { URL.revokeObjectURL(url); }
  }
}

function couper(ctx: CanvasRenderingContext2D, texte: string, largeurMax: number, maxLignes: number): string[] {
  const mots = texte.split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let cur = '';
  for (const m of mots) {
    const essai = cur ? `${cur} ${m}` : m;
    if (ctx.measureText(essai).width <= largeurMax || !cur) cur = essai;
    else { lignes.push(cur); cur = m; }
  }
  if (cur) lignes.push(cur);
  if (lignes.length > maxLignes) {
    const garde = lignes.slice(0, maxLignes);
    garde[maxLignes - 1] = garde[maxLignes - 1].replace(/\s*\S*$/, '') + '…';
    return garde;
  }
  return lignes;
}

/** Dessine la photo + cartouche dans le canvas fourni (aperçu et export utilisent le même rendu). */
export async function dessiner(canvas: HTMLCanvasElement, img: ImageBitmap, infos: InfosCartouche) {
  const ratio = img.width / img.height;
  const [W, H] = ratio >= 1 ? [GRAND_COTE, Math.round(GRAND_COTE / ratio)] : [Math.round(GRAND_COTE * ratio), GRAND_COTE];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);

  const u = Math.min(W, H) / 100; // unité : 1 % du petit côté → lisible en portrait comme en paysage
  const police = (taille: number, gras = 600) => `${gras} ${Math.round(taille * u)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  const marge = 2.4 * u;
  const largeurTexte = W - 2 * marge;

  // Lignes du cartouche
  type L = { t: string; taille: number; gras: number; couleur: string };
  const lignes: L[] = [];
  ctx.font = police(4.2, 800);
  couper(ctx, infos.adresse || 'Adresse non renseignée', largeurTexte, 2).forEach((t) => lignes.push({ t, taille: 4.2, gras: 800, couleur: '#fff' }));
  lignes.push({ t: infos.ligneVille, taille: 3.6, gras: 700, couleur: '#fff' });
  lignes.push({ t: `Le ${infos.date}`, taille: 3.6, gras: 700, couleur: '#fff' });
  lignes.push({ t: `GPS adresse : ${infos.gpsAdresse}`, taille: 3.1, gras: 600, couleur: '#fff' });
  lignes.push({ t: `GPS smartphone : ${infos.gpsSmartphone}`, taille: 3.1, gras: 600, couleur: '#fff' });
  lignes.push({
    t: infos.conformite.texte, taille: 3.1, gras: 800,
    couleur: infos.conformite.ok === true ? '#8EF0B5' : infos.conformite.ok === false ? '#FF8A80' : '#FFD27A',
  });
  if (infos.note) {
    ctx.font = police(3.1, 500);
    couper(ctx, infos.note, largeurTexte, 2).forEach((t) => lignes.push({ t, taille: 3.1, gras: 500, couleur: '#E6E6E6' }));
  }

  const interligne = 1.32;
  const hauteurBande = marge * 2 + lignes.reduce((h, l) => h + l.taille * u * interligne, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  ctx.fillRect(0, H - hauteurBande, W, hauteurBande);
  ctx.fillStyle = '#2E5E58';
  ctx.fillRect(0, H - hauteurBande, W, 0.6 * u);

  let y = H - hauteurBande + marge;
  ctx.textBaseline = 'top';
  for (const l of lignes) {
    ctx.font = police(l.taille, l.gras);
    ctx.fillStyle = l.couleur;
    let t = l.t;
    while (ctx.measureText(t).width > largeurTexte && t.length > 4) t = t.slice(0, -2) + '…';
    ctx.fillText(t, marge, y);
    y += l.taille * u * interligne;
  }
}

/** Version « brute » : même taille, sans cartouche, et sans métadonnées (le JPEG du canvas n'a pas d'EXIF). */
export async function versJpegBrut(img: ImageBitmap): Promise<Blob> {
  const ratio = img.width / img.height;
  const [W, H] = ratio >= 1 ? [GRAND_COTE, Math.round(GRAND_COTE / ratio)] : [Math.round(GRAND_COTE * ratio), GRAND_COTE];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);
  return versJpeg(c);
}

export const versJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Échec de la compression JPEG'))), 'image/jpeg', QUALITE_JPEG));
