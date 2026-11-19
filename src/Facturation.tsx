import { useEffect, useRef, useState } from 'react';
import {
  chargerFactures, chargerProfil, construireFacture, ecrireFacturePdf, enregistrerFactures, enregistrerProfil, lireFacturePdf,
  lireReleve, prochainNumero, profilIncomplet, type DonneesReleve, type Facture, type ProfilFacturation,
} from './facturation';
import { partagerFichier } from './partage';
import { dateFR } from './format';

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Onglet Réalisations > Facturation : importer un relevé de validation et générer sa facture pour STATERA. */
export default function Facturation() {
  const [profil, setProfil] = useState<ProfilFacturation | null>(null);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [releve, setReleve] = useState<DonneesReleve | null>(null);
  const [profilOuvert, setProfilOuvert] = useState(false);
  const [message, setMessage] = useState<{ txt: string; cls: string } | null>(null);
  const [derniere, setDerniere] = useState<{ pdf: File; facture: Facture; email: string } | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => { chargerProfil().then(setProfil); chargerFactures().then(setFactures); }, []);
  // Saisie unique : chaque modification est enregistrée aussitôt et resservira pour les prochaines factures
  const majProfil = (p: ProfilFacturation) => { setProfil(p); enregistrerProfil(p); };
  if (!profil) return null;

  const importer = async (f?: File) => {
    if (!f) return;
    setMessage(null); setDerniere(null);
    try {
      const r = await lireReleve(f);
      setReleve(r);
      if (factures.some((x) => x.releveId === r.id)) setMessage({ txt: 'Attention : ce relevé a déjà été facturé (voir « Mes factures »).', cls: 'orange' });
    } catch (e) {
      setReleve(null);
      setMessage({ txt: e instanceof Error ? e.message : String(e), cls: 'rouge' });
    }
  };

  const facturer = async () => {
    if (!releve) return;
    const manquants = profilIncomplet(profil);
    if (manquants.length) {
      setProfilOuvert(true);
      return setMessage({ txt: `Complétez d'abord vos coordonnées de facturation : ${manquants.join(', ')}.`, cls: 'rouge' });
    }
    if (factures.some((x) => x.releveId === releve.id) && !confirm('Ce relevé a déjà été facturé. Créer quand même une nouvelle facture ?')) return;
    const { pdf, facture } = construireFacture(await prochainNumero(), profil, releve);
    await ecrireFacturePdf(facture.id, pdf);
    const liste = [facture, ...factures];
    setFactures(liste); await enregistrerFactures(liste);
    setDerniere({ pdf, facture, email: releve.client.email });
    setReleve(null);
    setMessage({ txt: `Facture ${facture.numero} créée : ${eur(facture.montantTTC)}.`, cls: 'vert' });
  };

  const envoyer = (pdf: File, f: Facture, email?: string) => partagerFichier(pdf, `Facture ${f.numero}`,
    `Bonjour,\n\nVeuillez trouver ci-joint ma facture ${f.numero} (${eur(f.montantTTC)}) pour les relevés photographiques validés, tournée ${f.periode}.`
    + `${email ? `\n\n(À envoyer à : ${email})` : ''}\n\nCordialement,\n${profil.nom}`);

  const champ = (k: keyof ProfilFacturation, label: string, mode?: 'numeric' | 'email' | 'tel') => (
    <label className="champ"><span>{label}</span>
      <input value={profil[k]} inputMode={mode} onChange={(e) => majProfil({ ...profil, [k]: e.target.value })} /></label>
  );

  return (
    <section className="carte facturation">
      <h3>💶 Facturation</h3>
      <p className="aide">Quand STATERA vous envoie un <b>relevé de validation</b> (PDF), importez-le ici pour générer votre facture.</p>
      <input ref={fichier} type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { importer(e.target.files?.[0]); e.target.value = ''; }} />
      <button className="btn plein" onClick={() => fichier.current?.click()}>📥 Facturer un relevé de validation</button>
      {message && <div className={`alerte ${message.cls}`}>{message.txt}</div>}

      {releve && (
        <div className="carte releve-apercu">
          <b>Relevé du {dateFR(releve.etabliLe).slice(0, 10)} · validé par {releve.responsable}</b>
          <span className="aide">Tournée du {dateFR(releve.periode.debut).slice(0, 10)} au {dateFR(releve.periode.fin).slice(0, 10)} · {releve.intervenant}</span>
          <span className="aide">{releve.nbPayees} photo(s) validée(s) × {eur(releve.tarif)}
            {releve.refusees ? ` · ${releve.refusees} refusée(s)` : ''}{releve.enAttente ? ` · ${releve.enAttente} en attente` : ''}</span>
          <div className="kpi total"><b>{eur(releve.montant)} HT</b><span>à facturer à {releve.client.raisonSociale || 'STATERA Networks'}
            {profil.regimeTva === 'tva20' ? ` + TVA 20 % = ${eur(releve.montant * 1.2)} TTC` : ' (TVA non applicable)'}</span></div>
          <button className="btn plein" onClick={facturer}>Générer ma facture</button>
        </div>
      )}

      {derniere && (
        <>
          <button className="btn plein" onClick={() => envoyer(derniere.pdf, derniere.facture, derniere.email)}>Envoyer la facture {derniere.facture.numero} à STATERA</button>
          {derniere.email && <p className="aide">Adresse de réception des factures : <b>{derniere.email}</b></p>}
        </>
      )}

      <button className="dep-titre" onClick={() => setProfilOuvert(!profilOuvert)}>
        <span className="chevron">{profilOuvert ? '▾' : '▸'}</span>
        <span><b style={{ color: 'var(--texte)' }}>Mes coordonnées de facturation</b>
          <small>{profil.nom ? `${profil.nom} · SIRET ${profil.siret || '?'}` : 'À compléter avant la première facture'}</small></span>
      </button>
      {profilOuvert && (
        <>
          {champ('nom', 'Nom ou raison sociale *')}
          {champ('adresse', 'Adresse *')}
          <div className="ligne-champs">
            <div style={{ flex: 1 }}>{champ('codePostal', 'Code postal *', 'numeric')}</div>
            <div style={{ flex: 2 }}>{champ('ville', 'Ville *')}</div>
          </div>
          {champ('siret', 'SIRET *', 'numeric')}
          <label className="case case-tva">
            <input type="checkbox" checked={profil.regimeTva === 'tva20'}
              onChange={(e) => majProfil({ ...profil, regimeTva: e.target.checked ? 'tva20' : 'franchise' })} />
            <span><b>Je suis soumis à la TVA</b>
              <small>{profil.regimeTva === 'tva20'
                ? 'Facture : 5,00 € HT par photo + TVA 20 % (1,00 €), soit 6,00 € TTC par photo.'
                : 'Non coché : 5,00 € par photo, TVA non applicable (art. 293 B du CGI, micro-entrepreneur).'}</small></span>
          </label>
          {profil.regimeTva === 'tva20' && champ('numeroTva', 'N° de TVA intracommunautaire')}
          {champ('iban', 'IBAN *')}
          {champ('bic', 'BIC')}
          {champ('email', 'E-mail', 'email')}
          {champ('telephone', 'Téléphone', 'tel')}
          <p className="aide">✓ Enregistré automatiquement : vous n'aurez pas à les ressaisir.</p>
          <button className="btn contour" onClick={() => setProfilOuvert(false)}>Fermer</button>
        </>
      )}

      {factures.length > 0 && (
        <>
          <h4 className="titre-jour">Mes factures</h4>
          <ol className="liste-jour">
            {factures.map((f) => (
              <li key={f.id}>
                <span className="pastille-statut realise">€</span>
                <span className="liste-texte"><b>{f.numero} · {eur(f.montantTTC)}</b><small>{dateFR(f.dateISO).slice(0, 10)} · {f.nbPhotos} photos · tournée {f.periode}</small></span>
                <button className="mini" aria-label="Envoyer ou télécharger" onClick={async () => {
                  const b = await lireFacturePdf(f.id);
                  if (b) await envoyer(new File([b], `Facture_${f.numero}.pdf`, { type: 'application/pdf' }), f);
                }}>⬆</button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
