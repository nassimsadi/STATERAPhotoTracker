export type PhotoRecord = {
  id: string;
  fichier: string;        // nom du fichier JPEG dans le dossier de l'appli
  dateISO: string;        // date/heure de prise de vue
  latitude: number | null;
  longitude: number | null;
  precision: number | null; // précision GPS en mètres
  // Coordonnées tirées de l'adresse du site, et contrôle de cohérence avec la position du smartphone
  latitudeSite?: number | null;
  longitudeSite?: number | null;
  ecartM?: number | null;
  conformite?: 'conforme' | 'a_verifier';   // 'a_verifier' : non payée automatiquement, validation par le responsable
  motifVerification?: string;
  adresse: string;        // adresse du site (modifiable)
  codePostal: string;
  ville: string;
  departement: string;    // ex. "33 - Gironde"
  note: string;           // commentaire libre
  tourneeId?: string;     // renseigné quand la tournée est clôturée
  etapeId?: string;       // étape du plan de route photographiée
  siteRef?: string;       // référence du site dans le plan (colonne « Site »)
  etapeAdresse?: string;  // adresse d'origine de l'étape : « adresse|CP|ville »
};

export type Rapport = {
  id: string;
  dateISO: string;        // date de clôture
  intervenant: string;
  debutISO: string;
  finISO: string;
  nbPhotos: number;
  nbSites: number;
  nbVilles: number;
  nbDepartements: number;
  tarifUnitaire: number;  // € par photo
  montant: number;        // € validés automatiquement (adresses conformes)
  nbAVerifier?: number;   // photos soumises à la vérification du responsable
  montantEnAttente?: number;
  zipNom: string;
  pdfUri?: string;
  zipCle?: string;        // .zip de la tournée conservé sur l'appareil (onglet Réalisations)
  avancementPlan?: { faites: number; total: number; pct: number };
};

export const TARIF_PHOTO_EUR = 5;

/** Étape du plan de route (importée depuis un fichier CSV). */
export type EtapePlan = {
  id: string;
  ordre: number;
  ordreAuto?: boolean;    // ordre calculé par l'appli (itinéraire optimal) et non fourni par le fichier
  nonLocalisee?: boolean; // adresse introuvable lors du calcul d'itinéraire
  date: string;           // AAAA-MM-JJ ('' si non planifiée)
  nom: string;            // nom/référence du site
  adresse: string;
  codePostal: string;
  ville: string;
  latitude: number | null;
  longitude: number | null;
  consigne: string;       // instructions pour l'intervenant
};
