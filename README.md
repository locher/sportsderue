# Sports de rue

Carte mobile-first des **équipements sportifs mis à disposition gratuitement par les
collectivités françaises** : city-stades, terrains de basket, tables de ping-pong,
skateparks, aires de fitness, terrains de pétanque…

Pas de compte, pas de connexion : on arrive sur le site, on est géolocalisé, on voit
les équipements autour de soi. On filtre par sport en une tape, ou on cherche une ville.

## Principes

- **Mobile first** : carte plein écran, feuille de résultats glissante à trois positions,
  cibles tactiles généreuses, zones sûres iOS (`env(safe-area-inset-*)`) respectées.
- **PWA** : manifeste, icônes maskables, service worker (Workbox) avec mise en cache des
  tuiles IGN, du géocodage et des réponses Data ES → l'application s'installe sur l'écran
  d'accueil et reste consultable hors-ligne sur les zones déjà visitées.
- **Sans backend** : le navigateur interroge directement les API publiques de l'État.
  Rien à héberger d'autre que des fichiers statiques.
- **Sans traceur** : aucune donnée personnelle collectée, la position ne quitte pas
  l'appareil. L'état de la vue vit dans l'URL, les filtres dans le `localStorage`.

## Sources de données

| Usage | Service | Clé requise |
| --- | --- | --- |
| Équipements sportifs | [Data ES — Recensement des équipements sportifs](https://equipements.sports.gouv.fr/explore/dataset/data-es/) (ministère chargé des Sports, API Opendatasoft Explore v2.1) | non |
| Fond de carte | [Plan IGN v2 vectoriel](https://geoservices.ign.fr/services-geoplateforme-diffusion) (Géoplateforme) | non |
| Recherche de ville / adresse | [Géocodage Géoplateforme](https://geoservices.ign.fr/services-geoplateforme-geocodage) (Base Adresse Nationale) | non |

Quota anonyme de l'API Data ES : **5 000 appels par jour et par adresse IP**. Comme les
requêtes partent du navigateur de chaque visiteur, le quota est individuel ; l'application
limite malgré tout les appels (anti-rebond de 400 ms, cache mémoire réutilisant les
emprises déjà chargées, cache réseau du service worker).

### Quels équipements sont retenus ?

La sélection est faite côté API (`src/lib/dataes.ts`) :

- `equip_acc_libre = "true"` — accès libre déclaré par le propriétaire ;
- `equip_prop_type` limité aux personnes publiques (commune, EPCI, département, région,
  État, établissement public, multi-propriétaire) : les salles privées commerciales
  déclarées « en accès libre » sont ainsi écartées ;
- un type d'équipement (`equip_type_name`) ou une activité praticable (`aps_name`)
  appartenant à la taxonomie de `src/lib/sports.ts`.

Les catégories « nature » (randonnée, escalade, baignade) existent mais sont décochées par
défaut, pour que la carte urbaine reste lisible.

Ces données sont **déclaratives** : un équipement peut être fermé, en travaux ou réservé à
des créneaux scolaires. L'interface le dit sur chaque fiche.

## Développement

```bash
npm install
npm run dev        # serveur de développement Vite
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build de production dans dist/
npm run preview    # sert dist/ localement
npm run icons      # régénère les icônes PWA (script Python, sans dépendance)
```

Node 22+ recommandé. Le build produit un site statique : `dist/` se déploie tel quel sur
Netlify, Vercel, GitHub Pages, un simple Nginx… Une seule contrainte : **servir en HTTPS**,
sans quoi la géolocalisation et le service worker sont désactivés par les navigateurs.

## Architecture

```
src/
├── App.tsx                    état global (vue, filtres, sélection) et mise en page
├── types.ts                   modèle d'équipement, filtres, lieux
├── lib/
│   ├── dataes.ts              client Data ES : construction ODSQL, export GeoJSON, fiche
│   ├── sports.ts              taxonomie des sports (catégories, emojis, couleurs)
│   ├── geocode.ts             recherche et géocodage inverse Géoplateforme
│   ├── geo.ts                 distances, emprises, liens d'itinéraire
│   ├── cache.ts               cache mémoire des résultats par emprise + filtres
│   └── urlState.ts            état partageable dans l'URL, filtres mémorisés
├── hooks/
│   ├── useEquipments.ts       chargement des équipements de la vue (anti-rebond, abandon)
│   ├── useGeolocation.ts      géolocalisation ponctuelle et messages d'erreur
│   └── useViewportHeight.ts   hauteur visible réelle (mobile)
└── components/
    ├── MapView.tsx            carte MapLibre : épingles, agrégats, position, interactions
    ├── ResultsPanel.tsx       feuille de résultats glissante + liste triée par distance
    ├── EquipmentSheet.tsx     fiche détaillée d'un équipement
    ├── SearchPanel.tsx        recherche plein écran de ville / adresse
    ├── FilterSheet.tsx        filtres par sport et par caractéristique
    ├── SportChips.tsx         puces de filtre rapide
    ├── BottomSheet.tsx        primitive de feuille modale
    ├── AboutSheet.tsx         provenance des données, méthode, vie privée
    └── Icons.tsx              icônes SVG en ligne
```

Détails d'implémentation utiles à connaître :

- **Une requête par vue.** L'endpoint `exports/geojson` renvoie jusqu'à 1 500 équipements
  en un appel, là où `records` plafonne à 100. Au-delà de 1 500, la liste est signalée
  comme tronquée et le nombre réel est demandé séparément.
- **Zoom minimum.** En dessous du zoom 10,5 l'emprise couvre trop de territoire : rien
  n'est chargé et l'interface invite à zoomer ou à chercher une commune.
- **Agrégats MapLibre.** Les épingles sont générées au `<canvas>` (bulle blanche cerclée de
  la couleur de la catégorie + emoji), puis enregistrées comme images de style.
- **Worker MapLibre.** MapLibre déduit l'URL de son worker de la sienne, ce qu'un bundler
  casse : `setWorkerUrl()` reçoit le worker construit par Vite (`?worker&url`), et
  `optimizeDeps.exclude` évite le pré-bundling en développement.

## Limites connues et pistes

- Les tables de ping-pong extérieures ne sont pas un type d'équipement du RES : elles sont
  retrouvées via l'activité praticable, ce qui remonte aussi des plateaux multisports
  équipés d'une table (~220 en France).
- La distance affichée est à vol d'oiseau, pas un temps de marche.
- Pas encore : horaires d'ouverture (absents du RES), photos, signalement d'erreur intégré,
  itinéraire dans l'application.

## Licence

Code sous licence MIT. Données Data ES et Géoplateforme sous
[Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab). Application indépendante, sans lien officiel avec le ministère chargé des Sports.
