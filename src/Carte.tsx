import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { suivrePosition, type Position } from './geo';
import { traceRoutier } from './itineraire';
import type { EtapePlan } from './types';

// Fond de carte : Plan IGN (Géoplateforme, gratuit, sans clé). Repli automatique sur OpenStreetMap.
const IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'
  + '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

type Props = {
  etapes: EtapePlan[];                 // étapes affichées, dans l'ordre de passage
  faites: Map<string, number>;          // id étape → nombre de photos
  tracer: boolean;                      // dessiner le parcours (vue Jour)
  onPhotographier: (e: EtapePlan) => void;
  lienItineraire: (e: EtapePlan) => string;
};

export default function Carte({ etapes, faites, tracer, onPhotographier, lienItineraire }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const calques = useRef<{ etapes: L.LayerGroup; trace: L.LayerGroup; moi: L.LayerGroup } | null>(null);
  const rappel = useRef(onPhotographier);
  rappel.current = onPhotographier;
  const [position, setPosition] = useState<Position | null>(null);
  const [infoTrace, setInfoTrace] = useState('');
  const dejaCadre = useRef(false);

  // Création de la carte (une seule fois)
  useEffect(() => {
    if (!div.current || carte.current) return;
    const m = L.map(div.current, { zoomControl: true, attributionControl: true }).setView([46.6, 2.4], 6);
    let fond = L.tileLayer(IGN, { maxZoom: 19, attribution: '© IGN – Géoplateforme' }).addTo(m);
    let erreurs = 0;
    fond.on('tileerror', () => {
      if (++erreurs !== 3) return;
      m.removeLayer(fond);
      fond = L.tileLayer(OSM, { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }).addTo(m);
    });
    calques.current = { trace: L.layerGroup().addTo(m), etapes: L.layerGroup().addTo(m), moi: L.layerGroup().addTo(m) };
    carte.current = m;
    return () => { m.remove(); carte.current = null; };
  }, []);

  // Position de l'intervenant
  useEffect(() => suivrePosition(setPosition, () => {}), []);
  useEffect(() => {
    const c = calques.current;
    if (!c) return;
    c.moi.clearLayers();
    if (!position) return;
    L.circle([position.latitude, position.longitude], { radius: position.precision, color: '#1A73E8', weight: 1, fillOpacity: 0.1 }).addTo(c.moi);
    L.circleMarker([position.latitude, position.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 })
      .bindTooltip('Vous êtes ici').addTo(c.moi);
  }, [position]);

  // Étapes numérotées
  useEffect(() => {
    const c = calques.current, m = carte.current;
    if (!c || !m) return;
    c.etapes.clearLayers();
    const points: L.LatLngExpression[] = [];
    etapes.forEach((e, i) => {
      if (e.latitude == null || e.longitude == null) return;
      const nb = faites.get(e.id) ?? 0;
      const icone = L.divIcon({
        className: '',
        html: `<div class="repere ${nb ? 'fait' : ''}">${nb ? '✓' : (tracer ? i + 1 : e.ordre)}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -14],
      });
      const bulle = document.createElement('div');
      bulle.className = 'bulle';
      bulle.innerHTML = `${e.nom ? `<div class="ref">${echapper(e.nom)}</div>` : ''}<b>${echapper(e.adresse)}</b><br>${echapper(`${e.codePostal} ${e.ville}`)}`
        + (e.consigne ? `<div class="consigne">⚠︎ ${echapper(e.consigne)}</div>` : '')
        + (nb ? `<div class="fait">${nb} photo(s) prise(s)</div>` : '');
      const actions = document.createElement('div');
      actions.className = 'bulle-actions';
      const lien = document.createElement('a');
      lien.href = lienItineraire(e); lien.target = '_blank'; lien.rel = 'noreferrer'; lien.textContent = 'Itinéraire';
      const photo = document.createElement('button');
      photo.textContent = nb ? '📷 Encore' : '📷 Photo';
      photo.onclick = () => rappel.current(e);
      actions.append(lien, photo);
      bulle.append(actions);
      L.marker([e.latitude, e.longitude], { icon: icone }).bindPopup(bulle).addTo(c.etapes);
      points.push([e.latitude, e.longitude]);
    });
    if (points.length && !dejaCadre.current) {
      m.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 15 });
      dejaCadre.current = true;
    }
  }, [etapes, faites, tracer, lienItineraire]);

  // Tracé du parcours par la route (étapes restantes, dans l'ordre)
  useEffect(() => {
    const c = calques.current;
    if (!c) return;
    c.trace.clearLayers();
    setInfoTrace('');
    const restantes = etapes.filter((e) => !faites.get(e.id) && e.latitude != null && e.longitude != null);
    if (!tracer || restantes.length < 2) return;
    let annule = false;
    const pts = restantes.map((e) => ({ latitude: e.latitude!, longitude: e.longitude! }));
    // Tracé provisoire en pointillés, remplacé par le tracé routier dès qu'il est disponible
    const provisoire = L.polyline(pts.map((p) => [p.latitude, p.longitude] as L.LatLngTuple), { color: '#2E5E58', weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(c.trace);
    traceRoutier(pts).then((geo) => {
      if (annule || !geo) { if (!geo && !annule) setInfoTrace('Tracé routier indisponible : lignes droites affichées.'); return; }
      c.trace.removeLayer(provisoire);
      L.polyline(geo, { color: '#2E5E58', weight: 5, opacity: 0.85 }).addTo(c.trace);
    });
    return () => { annule = true; };
  }, [etapes, faites, tracer]);

  const recentrer = () => {
    const m = carte.current;
    if (!m) return;
    const pts: L.LatLngTuple[] = etapes.filter((e) => e.latitude != null).map((e) => [e.latitude!, e.longitude!]);
    if (position) pts.push([position.latitude, position.longitude]);
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
  };
  const nonLocalisees = etapes.filter((e) => e.latitude == null).length;

  return (
    <div className="carte-bloc">
      <div ref={div} className="carte-leaflet" />
      <div className="carte-outils">
        <button className="btn contour petit" onClick={recentrer}>⤢ Tout afficher</button>
        {position && <button className="btn contour petit" onClick={() => carte.current?.setView([position.latitude, position.longitude], 16)}>◉ Ma position</button>}
      </div>
      {infoTrace && <p className="aide">{infoTrace}</p>}
      {nonLocalisees > 0 && <p className="aide">{nonLocalisees} étape(s) sans coordonnées ne figurent pas sur la carte.</p>}
    </div>
  );
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
