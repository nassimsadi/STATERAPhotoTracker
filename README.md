# STATERA PhotoTracker

Application web installable de photos de site.

Fonctionne sur iPhone et Android, sans store : on ouvre le lien, puis « Ajouter à l'écran d'accueil ».

- **Intervenant** : adresse de l'appli.
- **Responsable (validation)** : adresse de l'appli suivie de `#validation`.

## Développement

```bash
npm install
npm run dev      # test local
npm run build    # version à mettre en ligne : dossier dist/
```

Le dossier `dist/` peut être hébergé n'importe où en HTTPS (Netlify, GitHub Pages, Cloudflare Pages, serveur de l'entreprise).

## Fonctionnement

- Photo : 1600 px, JPEG qualité 0,6, avec un cartouche (adresse, CP, ville, département, date et heure, GPS de l'adresse, GPS du smartphone, écart).
- Contrôle de position : le GPS de l'adresse (Base Adresse Nationale, data.geopf.fr) est comparé au GPS du smartphone. Tolérance : 150 m + la précision du GPS (50 m au plus), réglable dans `src/geo.ts`. Si l'adresse n'est pas validée, la photo est marquée « À vérifier » et n'est pas payée automatiquement.
- Plan de route : import Excel (.xlsx) ou CSV, vues jour/semaine/tout, avancement en %. Un modèle est fourni : `public/plan-de-route-modele.xlsx`.
- Itinéraire optimal **par la route** (jusqu'à 100 sites/jour et plus) : temps de trajet routiers via OSRM (repli Valhalla), requêtes par blocs de 50×50 ; ordre exact jusqu'à 13 étapes (Held-Karp), au-delà plus proche voisin + 2-opt + Or-opt + recherche locale itérée (< 1 s pour 100 sites). Navigation Google Maps par tranches de 10 étapes restantes.
- Fin de tournée : .zip (Département/Ville + `recapitulatif.csv` + `donnees-validation.json`), puis rapport PDF (5 € par photo validée).
- Validation responsable : import du .zip, décision Valider/Refuser photo par photo, relevé de validation en PDF.
- Données stockées sur l'appareil (IndexedDB) : aucun serveur, aucune donnée centralisée.
