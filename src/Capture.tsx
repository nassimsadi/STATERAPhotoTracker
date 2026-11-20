import { useEffect, useRef, useState } from 'react';
import { chargerImage, dessiner, versJpeg, versJpegBrut, type InfosCartouche } from './cartouche';
import { adresseDepuisGPS, coordsDepuisAdresse, suivrePosition, tolerance, type CoordsSite, type Position } from './geo';
import { codeDepartementDepuisCP, libelleDepartement } from './departements';
import { dateFR, distanceM, distanceTexte, gpsTexte } from './format';
import { ecrireBlob } from './db';
import type { EtapePlan, PhotoRecord } from './types';

type Props = {
  etape: EtapePlan | null;
  signalementInitial?: boolean;   // ouvert depuis le bouton « Adresse inexistante »
  onEnregistree: (r: PhotoRecord, continuer: boolean) => void;
  onFermer: () => void;
};

export default function Capture({ etape, signalementInitial, onEnregistree, onFermer }: Props) {
  // ---- Signalement d'adresse inexistante ----
  const [signalement, setSignalement] = useState(!!signalementInitial);
  const [observation, setObservation] = useState('');
  // ---- GPS du smartphone (suivi continu tant que l'écran est ouvert) ----
  const [position, setPosition] = useState<Position | null>(null);
  const [erreurGps, setErreurGps] = useState('');
  useEffect(() => suivrePosition((p) => { setPosition(p); setErreurGps(''); }, setErreurGps), []);

  // ---- Photo ----
  const entree = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [dateISO, setDateISO] = useState('');
  const [positionPhoto, setPositionPhoto] = useState<Position | null>(null);

  const photoChoisie = async (f: File | undefined) => {
    if (!f) return;
    const maintenant = Date.now();
    // Date de prise : celle du fichier si elle est récente (Android), sinon l'heure actuelle.
    const t = f.lastModified && maintenant - f.lastModified >= 0 && maintenant - f.lastModified < 10 * 60_000 ? f.lastModified : maintenant;
    setDateISO(new Date(t).toISOString());
    setPositionPhoto(position);
    setImage(await chargerImage(f));
  };
  // Si le GPS n'avait pas encore de point au moment de la photo, on prend le premier qui arrive.
  useEffect(() => { if (image && !positionPhoto && position) setPositionPhoto(position); }, [image, position, positionPhoto]);

  // ---- Localisation du site ----
  const [adresse, setAdresse] = useState(etape?.adresse ?? '');
  const [codePostal, setCodePostal] = useState(etape?.codePostal ?? '');
  const [ville, setVille] = useState(etape?.ville ?? '');
  const [departement, setDepartement] = useState(etape ? libelleDepartement(codeDepartementDepuisCP(etape.codePostal)) : '');
  const [note, setNote] = useState(etape?.nom ? `Site ${etape.nom}` : '');
  const [recherche, setRecherche] = useState(false);

  // Photo hors plan : adresse proposée à partir du GPS
  const prerempli = useRef(!!etape);
  useEffect(() => {
    if (prerempli.current || !positionPhoto) return;
    prerempli.current = true;
    setRecherche(true);
    adresseDepuisGPS(positionPhoto.latitude, positionPhoto.longitude).then((a) => {
      if (a) {
        setAdresse((v) => v || a.adresse); setCodePostal((v) => v || a.codePostal);
        setVille((v) => v || a.ville); setDepartement((v) => v || a.departement);
      }
      setRecherche(false);
    });
  }, [positionPhoto]);

  const changerCP = (cp: string) => {
    setCodePostal(cp);
    const code = codeDepartementDepuisCP(cp);
    if (code) setDepartement(libelleDepartement(code));
  };

  // ---- Coordonnées tirées de l'adresse + contrôle de conformité ----
  const [site, setSite] = useState<CoordsSite | null>(null);
  const [calculSite, setCalculSite] = useState(false);
  useEffect(() => {
    if (!adresse.trim() || !ville.trim()) { setSite(null); return; }
    if (etape && etape.latitude != null && etape.longitude != null
      && adresse === etape.adresse && ville === etape.ville && codePostal === etape.codePostal) {
      setSite({ etat: 'ok', latitude: etape.latitude, longitude: etape.longitude, libelle: 'coordonnées du plan de route' });
      return;
    }
    let annule = false;
    setCalculSite(true);
    const t = setTimeout(async () => {
      const r = await coordsDepuisAdresse(adresse, codePostal, ville);
      if (!annule) { setSite(r); setCalculSite(false); }
    }, 700);
    return () => { annule = true; clearTimeout(t); };
  }, [adresse, codePostal, ville, etape]);

  const pos = positionPhoto;
  const ecart = site?.etat === 'ok' && pos ? distanceM(site.latitude, site.longitude, pos.latitude, pos.longitude) : null;
  const tol = tolerance(pos?.precision ?? null);
  const conforme = ecart != null && ecart <= tol;

  // Motif de vérification manuelle (adresse non validée automatiquement)
  const motif = signalement ? `Adresse inexistante signalée${observation.trim() ? ` : ${observation.trim()}` : ''}`
    : conforme ? ''
    : site?.etat === 'introuvable' ? 'Adresse introuvable'
    : site?.etat === 'hors_ligne' ? 'Position non vérifiable (hors réseau)'
    : ecart != null ? `Écart de ${distanceTexte(ecart)} avec l'adresse (tolérance ${Math.round(tol)} m)`
    : '';
  const conformite: InfosCartouche['conformite'] =
    signalement ? { texte: 'ADRESSE INEXISTANTE SIGNALÉE', ok: false }
    : conforme ? { texte: `Adresse validée ✓ · écart ${Math.round(ecart!)} m`, ok: true }
    : motif ? { texte: `À VÉRIFIER · ${motif}`, ok: false }
    : { texte: 'Contrôle de position…', ok: null };

  // ---- Aperçu = rendu final ----
  useEffect(() => {
    if (!image || !canvas.current) return;
    dessiner(canvas.current, image, {
      adresse,
      ligneVille: `${[codePostal, ville].filter(Boolean).join(' ') || '—'} · ${departement || 'Département inconnu'}`,
      gpsAdresse: site?.etat === 'ok' ? gpsTexte(site.latitude, site.longitude) : '—',
      gpsSmartphone: pos ? `${gpsTexte(pos.latitude, pos.longitude)} (±${Math.round(pos.precision)} m)` : 'en attente…',
      conformite,
      date: dateFR(dateISO),
      note: [signalement && observation.trim() ? `Constat : ${observation.trim()}` : '', note].filter(Boolean).join(' · '),
    });
  }, [image, adresse, codePostal, ville, departement, note, site, pos, dateISO, conformite.texte, signalement, observation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Enregistrement ----
  const [enCours, setEnCours] = useState<null | 'suite' | 'seul'>(null);
  const [message, setMessage] = useState('');
  const enregistrer = async (continuer: boolean) => {
    const manquants = [
      !pos ? 'coordonnées GPS du smartphone' : null,
      !adresse.trim() ? 'adresse' : null,
      !codePostal.trim() ? 'code postal' : null,
      !ville.trim() ? 'ville' : null,
    ].filter(Boolean);
    if (manquants.length) return setMessage(`Il manque : ${manquants.join(', ')}. Chaque photo doit comporter la date, l'heure, la localisation et les coordonnées GPS.`);
    if (signalement) {
      if (!observation.trim()) return setMessage("Décrivez ce que vous constatez sur place (ex. : « numéro inexistant, la rue s'arrête au n° 10 »).");
      if (!confirm("Signalement d'adresse inexistante : cette photo sert de preuve de votre passage.\n\n"
        + 'Il sera vérifié par STATERA avant paiement. Enregistrer le signalement ?')) return;
    } else if (calculSite || !site) return setMessage("Patientez : calcul des coordonnées de l'adresse en cours…");
    else if (!conforme && !confirm(
      `Adresse non validée : ${motif}.\n\nLa photo sera enregistrée mais NE SERA PAS PAYÉE automatiquement : `
      + 'elle sera vérifiée par votre responsable.\n\nEnregistrer quand même ?')) return;
    setMessage('');
    setEnCours(continuer ? 'suite' : 'seul');
    try {
      const blob = await versJpeg(canvas.current!);
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await ecrireBlob(id, blob);
      await ecrireBlob(`${id}:brute`, await versJpegBrut(image!));   // version sans cartouche
      onEnregistree({
        id, fichier: `${id}.jpg`, dateISO, latitude: pos!.latitude, longitude: pos!.longitude, precision: pos!.precision,
        latitudeSite: site?.etat === 'ok' ? site.latitude : null, longitudeSite: site?.etat === 'ok' ? site.longitude : null,
        ecartM: ecart != null ? Math.round(ecart) : null, conformite: conforme && !signalement ? 'conforme' : 'a_verifier',
        motifVerification: motif || undefined,
        signalement: signalement ? 'adresse_inexistante' : undefined,
        observation: signalement ? observation.trim() : undefined,
        adresse: adresse.trim(), codePostal: codePostal.trim(), ville: ville.trim(),
        departement: departement.trim() || libelleDepartement(null), note: note.trim(), etapeId: etape?.id,
        siteRef: etape?.nom || undefined,
        datePrevue: etape?.date || undefined,
        etapeAdresse: etape ? `${etape.adresse}|${etape.codePostal}|${etape.ville}` : undefined,
      }, continuer);
      if (continuer) { setImage(null); setPositionPhoto(null); }
    } catch (e) {
      setMessage(`Impossible d'enregistrer la photo : ${String(e)}`);
    } finally {
      setEnCours(null);
    }
  };

  const etatGps = erreurGps && !position ? { txt: erreurGps, cls: 'rouge' }
    : !position ? { txt: 'Recherche GPS…', cls: 'orange' }
    : { txt: `GPS actif ±${Math.round(position.precision)} m`, cls: position.precision <= 30 ? 'vert' : 'orange' };

  return (
    <div className="ecran">
      <header className="barre-haut">
        <button className="lien" onClick={onFermer}>‹ Retour</button>
        <h1>{signalement ? 'Adresse inexistante' : image ? 'Vérifier et enregistrer' : 'Nouvelle photo'}</h1>
        <span style={{ width: 70 }} />
      </header>
      <main className="contenu">
        <div className={`pastille-gps ${etatGps.cls}`}><span className="point" />{etatGps.txt}</div>
        {etape && (
          <div className="carte etape-rappel">
            {etape.nom && <div className="ref">{etape.nom}</div>}
            <div className="gras">{etape.adresse}</div>
            <div className="aide">{etape.codePostal} {etape.ville}</div>
            {etape.consigne && <div className="consigne">⚠︎ {etape.consigne}</div>}
          </div>
        )}

        <input ref={entree} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { photoChoisie(e.target.files?.[0]); e.target.value = ''; }} />

        {!image ? (
          <>
            {signalement && <div className="alerte orange">Photographiez l'endroit où devrait se trouver l'adresse : cette photo prouve votre passage.</div>}
            <button className="btn plein enorme" onClick={() => entree.current?.click()}>📷  {signalement ? 'Photographier l\'endroit' : 'Prendre la photo'}</button>
            <div className="conseil-cadrage">
              <b>Cadrez tout le site</b>
              <span>Reculez pour que l'ensemble soit visible (armoire, façade, abords). Si besoin, passez l'appareil photo
                en grand-angle (<b>0,5×</b>). Plusieurs photos par site sont possibles.</span>
            </div>
          </>
        ) : (
          <>
            <canvas ref={canvas} className="apercu" />
            <div className="carte">
              {recherche && <p className="aide">Recherche de l'adresse…</p>}
              <Champ label="Adresse du site *" valeur={adresse} onChange={setAdresse} placeholder="N° et rue" />
              <div className="ligne-champs">
                <Champ label="Code postal *" valeur={codePostal} onChange={changerCP} mode="numeric" style={{ flex: 1 }} />
                <Champ label="Ville *" valeur={ville} onChange={setVille} style={{ flex: 2 }} />
              </div>
              <Champ label="Département" valeur={departement} onChange={setDepartement} />
              <Champ label="Note (facultatif)" valeur={note} onChange={setNote} placeholder="Ex. : armoire de rue, façade nord…" />
              <p className="aide">Date et heure : <b>{dateFR(dateISO)}</b> (automatique)</p>
              <p className="aide">GPS smartphone : <b>{pos ? `${gpsTexte(pos.latitude, pos.longitude)} (±${Math.round(pos.precision)} m)` : 'en attente…'}</b></p>
              <p className="aide">GPS de l'adresse : <b>{calculSite ? 'calcul…' : site?.etat === 'ok' ? gpsTexte(site.latitude, site.longitude) : '—'}</b>
                {site?.etat === 'ok' && site.libelle ? <> <br />({site.libelle})</> : null}</p>
              {!signalement && <Conformite calcul={calculSite} site={site} ecart={ecart} conforme={conforme} tol={tol} gpsOk={!!pos} />}
            </div>
            <div className={`carte signalement ${signalement ? 'actif' : ''}`}>
              <label className="case">
                <input type="checkbox" checked={signalement} onChange={(e) => setSignalement(e.target.checked)} />
                <span><b>🚫 L'adresse n'existe pas sur place</b>
                  <small>Signalez-le : la photo de l'endroit sert de preuve de votre passage. Vérifié par STATERA avant paiement.</small></span>
              </label>
              {signalement && (
                <label className="champ"><span>Ce que vous constatez *</span>
                  <textarea rows={3} value={observation} onChange={(e) => setObservation(e.target.value)}
                    placeholder="Ex. : la rue s'arrête au n° 10 ; terrain vague ; aucune armoire à cet emplacement…" /></label>
              )}
              {!signalement && site?.etat === 'introuvable' && (
                <p className="aide">L'adresse est introuvable : si elle n'existe pas sur place, cochez la case ci-dessus.</p>
              )}
            </div>
            {message && <div className="alerte rouge">{message}</div>}
            <button className="btn plein" disabled={!!enCours} onClick={() => enregistrer(true)}>
              {enCours === 'suite' ? 'Enregistrement…' : 'Enregistrer et photo suivante'}
            </button>
            <button className="btn contour" disabled={!!enCours} onClick={() => enregistrer(false)}>
              {enCours === 'seul' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button className="btn texte-rouge" disabled={!!enCours} onClick={() => { setImage(null); setMessage(''); entree.current?.click(); }}>
              Reprendre la photo
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function Conformite({ calcul, site, ecart, conforme, tol, gpsOk }: {
  calcul: boolean; site: CoordsSite | null; ecart: number | null; conforme: boolean; tol: number; gpsOk: boolean;
}) {
  if (!gpsOk) return <div className="alerte orange">En attente du GPS du smartphone…</div>;
  if (calcul || !site) return <div className="alerte gris">Contrôle de position en cours…</div>;
  const suite = ' La photo peut être enregistrée, mais elle ne sera pas payée automatiquement : vérification par le responsable.';
  if (site.etat === 'introuvable') return <div className="alerte rouge">Adresse introuvable : vérifiez l'adresse, le code postal et la ville.{suite}</div>;
  if (site.etat === 'hors_ligne') return <div className="alerte orange">Pas de réseau : la position ne peut pas être contrôlée.{suite}</div>;
  return conforme
    ? <div className="alerte vert">✓ Adresse validée : {Math.round(ecart!)} m de l'adresse (tolérance {Math.round(tol)} m)</div>
    : <div className="alerte rouge">✕ Position non conforme : {distanceTexte(ecart!)} de l'adresse (tolérance {Math.round(tol)} m).{suite}</div>;
}

function Champ({ label, valeur, onChange, placeholder, mode, style }: {
  label: string; valeur: string; onChange: (v: string) => void; placeholder?: string; mode?: 'numeric'; style?: React.CSSProperties;
}) {
  return (
    <label className="champ" style={style}>
      <span>{label}</span>
      <input value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={mode} />
    </label>
  );
}
