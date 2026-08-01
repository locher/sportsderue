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
| Aires de jeux pour enfants | [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Overpass](https://overpass-api.de/) | non |
| Fond de carte | [Plan IGN v2 vectoriel](https://geoservices.ign.fr/services-geoplateforme-diffusion) (Géoplateforme) | non |
| Recherche de ville / adresse | [Géocodage Géoplateforme](https://geoservices.ign.fr/services-geoplateforme-geocodage) (Base Adresse Nationale) | non |

Quota anonyme de l'API Data ES : **5 000 appels par jour et par adresse IP**. Comme les
requêtes partent du navigateur de chaque visiteur, le quota est individuel ; l'application
limite malgré tout les appels (anti-rebond de 400 ms, cache mémoire réutilisant les
emprises déjà chargées, cache réseau du service worker).

### Pourquoi les aires de jeux viennent d'ailleurs

Le RES ne recense que du **sport** : ses 185 valeurs de `equip_type_name` ne contiennent
aucune aire de jeux, et la plus proche — « Parc Mobil'Ludique », 144 enregistrements — est
une piste d'éducation routière. data.gouv.fr n'héberge que des jeux de données communaux
isolés. Il n'existe donc aucun référentiel national des aires de jeux ; OpenStreetMap est
la seule couverture complète (**45 922** objets `leisure=playground` en France, dont deux
tiers dessinés en polygones, ramenés à un point par `out center`).

Overpass est un service bénévole, plus lent (2 à 15 s) et plus fragile que l'API du
ministère — il répond régulièrement 504, ou 200 avec une page HTML « too busy ». D'où
trois précautions dans `src/lib/overpass.ts` :

- la catégorie « Jeux » est **décochée par défaut** : seuls ceux qui la cochent paient
  l'appel ;
- l'appel est **indépendant** de celui de Data ES, sur son propre effet — une panne ou une
  lenteur d'OpenStreetMap ne retient jamais la liste des équipements sportifs ;
- l'échec ne remonte qu'un **avertissement discret** au-dessus de la liste, après une
  unique reprise à 1,5 s (les pannes observées sont passagères ; insister davantage sur un
  service saturé serait contre-productif).

Mêmes exigences d'accès que pour le RES, traduites en étiquettes OSM : `access` valant
`private`, `customers`, `no`, `permit`, `members` ou `residents` est écarté (`permissive`
est conservé), ainsi que `indoor=yes` et `fee=yes`. Une aire **sans** étiquette `access`
est retenue : c'est le cas le plus fréquent, et l'absence d'étiquette n'est pas une
restriction.

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

### Type d'équipement *et* activité praticable

Le RES décrit un équipement de deux façons : ce qu'il **est** (`equip_type_name`) et ce
qu'on **peut y pratiquer** (`aps_name`, multivalué). Un city-stade est un équipement
unique — `Multisports/City-stades` — qui déclare le plus souvent basket, foot, hand et
volley. Ne chercher que sur le type le rendait introuvable derrière le filtre « Basket »,
alors qu'on y joue au basket. Les deux champs sont donc interrogés :

| Filtre | Par type seul | Type ou activité |
| --- | ---: | ---: |
| Handball | 751 | 12 408 |
| Basket | 4 084 | 17 732 |
| Volley | 1 075 | 4 907 |
| Football | 16 024 | 28 226 |
| Tennis | 6 458 | 8 665 |
| Pétanque | 20 952 | 21 416 |

L'écart est le plus fort là où le sport se pratique surtout sur un terrain partagé
(handball, basket) et négligeable là où il a son propre terrain (pétanque).

Deux garde-fous :

- **L'affichage ne change pas.** Un city-stade retrouvé via « Basket » garde son épingle
  et son libellé de city-stade : il n'est pas dupliqué en une épingle par activité. La
  liste ajoute simplement une mention « 🏀 Basket praticable » pour expliquer sa présence,
  et seulement quand sa propre catégorie n'est pas cochée.
- **L'activité est un signal plus faible que le type** — un gymnase peut déclarer dix
  activités et remonter sous dix filtres. Les correspondances par activité sont donc
  restreintes au plein air : hors salle pour les catégories urbaines, sites naturels
  compris pour les catégories nature.

La vue par défaut, elle, ne bouge quasiment pas (+0,3 % d'équipements) : ces city-stades
étaient déjà sur la carte, ils n'étaient simplement pas atteignables par sport.

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

### Déploiement

- **Netlify / Vercel** — importer le dépôt, rien à configurer (`netlify.toml` fixe la
  commande, le dossier publié et les en-têtes de cache). Le site est servi à la racine.
- **Autre hébergeur, dans un sous-chemin** — passer `BASE_PATH=/mon-chemin/` au build :
  les URL d'assets, le `start_url`/`scope` du manifeste et le repli du service worker
  suivent automatiquement.

## Architecture

```
src/
├── App.tsx                    état global (vue, filtres, sélection) et mise en page
├── types.ts                   modèle d'équipement, filtres, lieux
├── lib/
│   ├── dataes.ts              client Data ES : construction ODSQL, export GeoJSON, fiche
│   ├── overpass.ts            client Overpass : aires de jeux OpenStreetMap
│   ├── sports.ts              taxonomie des sports (types, activités, emojis, couleurs)
│   ├── geocode.ts             recherche et géocodage inverse Géoplateforme
│   ├── geo.ts                 distances, emprises, liens d'itinéraire
│   ├── cache.ts               cache mémoire des résultats par emprise + filtres
│   ├── text.ts                comparaison de libellés « au sens près »
│   └── urlState.ts            état partageable dans l'URL, filtres mémorisés
├── hooks/
│   ├── useEquipments.ts       chargement de la vue depuis les deux bases (anti-rebond, abandon)
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

- **Une requête par vue et par base.** L'endpoint `exports/geojson` renvoie jusqu'à 1 500
  équipements en un appel, là où `records` plafonne à 100. Au-delà de 1 500, la liste est
  signalée comme tronquée et le nombre réel est demandé séparément. Les aires de jeux
  suivent le même cycle sur leur propre effet, plafonnées à 900 (Paris entier en compte
  ~1 400).
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
- L'activité « Vtt (Cross Country/…) » n'est volontairement pas rattachée aux catégories
  urbaines : 9 300 des 12 300 équipements qui la déclarent sont des boucles de randonnée,
  qui noieraient la vue de proximité. Elles restent accessibles via la catégorie Randonnée.
- Les correspondances par activité écartent les équipements dont `equip_nature` est vide
  (~750 en France, dont 173 city-stades). Ceux-là restent trouvables par leur type.
- Les aires de jeux dépendent de la couverture d'OpenStreetMap : trois sur quatre n'ont
  pas de nom, les équipements (`playground=slide`…) et la tranche d'âge sont renseignés sur
  moins de 6 % d'entre elles, et le service Overpass est régulièrement saturé.
- La distance affichée est à vol d'oiseau, pas un temps de marche.
- Pas encore : horaires d'ouverture (absents du RES), photos, signalement d'erreur intégré,
  itinéraire dans l'application.

## Licence

Code sous licence MIT. Données Data ES et Géoplateforme sous
[Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab). Aires de jeux © les contributeurs
[OpenStreetMap](https://www.openstreetmap.org/copyright), sous ODbL. Application
indépendante, sans lien officiel avec le ministère chargé des Sports.
