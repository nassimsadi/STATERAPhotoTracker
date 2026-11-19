import { useEffect, useState } from 'react';
import { chargerClientFacturation, enregistrerClientFacturation } from './validationDb';
import { CLIENT_VIDE, type CoordonneesClient } from './facturation';

/** Coordonnées de facturation de STATERA, reprises sur les factures des intervenants. */
export default function CoordonneesStatera() {
  const [c, setC] = useState<CoordonneesClient>(CLIENT_VIDE);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => { chargerClientFacturation().then((v) => { setC(v); setOuvert(!v.adresse); }); }, []);
  const champ = (k: keyof CoordonneesClient, label: string) => (
    <label className="champ"><span>{label}</span>
      <input value={c[k]} onChange={(e) => { const n = { ...c, [k]: e.target.value }; setC(n); enregistrerClientFacturation(n); }} /></label>
  );
  return (
    <div className="carte">
      <button className="dep-titre" onClick={() => setOuvert(!ouvert)}>
        <span className="chevron">{ouvert ? '▾' : '▸'}</span>
        <span><b style={{ color: 'var(--texte)' }}>Coordonnées de facturation STATERA</b>
          <small>{c.adresse ? `${c.raisonSociale} · ${c.codePostal} ${c.ville}` : 'À compléter : reprises sur les factures des intervenants'}</small></span>
      </button>
      {ouvert && (
        <>
          {champ('raisonSociale', 'Raison sociale *')}
          {champ('adresse', 'Adresse *')}
          <div className="ligne-champs">
            <div style={{ flex: 1 }}>{champ('codePostal', 'Code postal *')}</div>
            <div style={{ flex: 2 }}>{champ('ville', 'Ville *')}</div>
          </div>
          {champ('siret', 'SIRET')}
          {champ('tva', 'N° TVA intracommunautaire')}
          {champ('email', 'E-mail de réception des factures')}
          <p className="aide">✓ Enregistré automatiquement : à saisir une seule fois, repris dans tous les prochains relevés.</p>
          <button className="btn contour" onClick={() => setOuvert(false)}>Fermer</button>
        </>
      )}
    </div>
  );
}
