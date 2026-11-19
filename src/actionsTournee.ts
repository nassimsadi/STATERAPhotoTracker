// Actions sur le parcours d'une journée : inversion du sens et itinéraire optimal depuis la position.
import { positionUnique } from './geo';
import { distanceTexte } from './format';
import { dureeTexte, localiserEtapes, optimiser } from './itineraire';
import type { EtapePlan } from './types';

const separer = (etapes: EtapePlan[], nb: Map<string, number>) => ({
  faites: etapes.filter((e) => nb.get(e.id)).sort((a, b) => a.ordre - b.ordre),
  restantes: etapes.filter((e) => !nb.get(e.id)).sort((a, b) => a.ordre - b.ordre),
});

const appliquer = (plan: EtapePlan[], ordre: EtapePlan[], auto?: boolean) => {
  const m = new Map<string, EtapePlan>();
  ordre.forEach((e, i) => m.set(e.id, { ...e, ordre: i + 1, ...(auto ? { ordreAuto: true } : {}) }));
  return plan.map((e) => m.get(e.id) ?? e);
};

/** Inverse le sens des étapes restantes : la dernière devient la première. */
export function inverserParcours(plan: EtapePlan[], etapes: EtapePlan[], nb: Map<string, number>) {
  const { faites, restantes } = separer(etapes, nb);
  if (restantes.length < 2) return null;
  const premiere = restantes[restantes.length - 1];
  return {
    plan: appliquer(plan, [...faites, ...[...restantes].reverse()]),
    message: `Sens inversé : départ par ${premiere.nom ? `${premiere.nom} – ` : ''}${premiere.adresse}, ${premiere.ville}.`,
  };
}

/** Ordre optimal (par la route) des étapes restantes, en partant de la position de l'intervenant. */
export async function optimiserDepuisPosition(plan: EtapePlan[], etapes: EtapePlan[], nb: Map<string, number>, etat: (t: string) => void) {
  const { faites, restantes } = separer(etapes, nb);
  if (!restantes.length) return { plan, message: 'Toutes les étapes de ce jour ont déjà été photographiées.' };
  etat('Recherche de votre position…');
  const pos = await positionUnique().catch(() => null);
  etat('Calcul de l\'itinéraire optimal par la route…');
  const localisees = await localiserEtapes(restantes);
  const { ordre, distanceM, dureeS, source } = await optimiser(localisees, pos ?? undefined);
  const nonLoc = ordre.filter((e) => e.latitude == null).length;
  return {
    plan: appliquer(plan, [...faites, ...ordre], true),
    message: `Itinéraire optimisé${pos ? ' depuis votre position' : ''} : ${ordre.length} étape(s) restante(s), `
      + (source === 'vol d\'oiseau'
        ? `environ ${distanceTexte(distanceM)} (estimation : service d'itinéraire injoignable, vérifiez votre réseau).`
        : `${distanceTexte(distanceM)} et ${dureeTexte(dureeS)} de route.`)
      + (pos ? '' : ' (Position GPS indisponible : départ depuis la première étape.)')
      + (nonLoc ? ` ${nonLoc} adresse(s) introuvable(s) placée(s) à la fin.` : ''),
  };
}
