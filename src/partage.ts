/** Ouvre le menu Partager du téléphone (Mail, Outlook, Gmail, Drive, OneDrive…) ; sinon télécharge le fichier. */
export async function partagerFichier(f: File, titre: string, texte: string): Promise<'partage' | 'telechargement' | 'annule'> {
  if (navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f], title: titre, text: texte });
      return 'partage';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
      // Autre erreur (ex. geste utilisateur expiré) : on bascule sur le téléchargement
    }
  }
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'telechargement';
}
