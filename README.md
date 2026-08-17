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
| Aires de jeux pour enfants | [OpenStreetMap](https://www.openstreetmap.org/copyright), relevé à l'avance et livré avec l'application | non |
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
la seule couverture complète (~**46 000** objets `leisure=playground` en France).

Ces données ne sont **pas interrogées à l'exécution**. Overpass, le service qui permet de
les requêter, a été essayé et abandonné : mesuré en série sur une même vue, il échouait
**trois fois sur huit** (504 de passerelle, 429 de quota, pages « too busy » servies avec
un statut 200), au point que la catégorie ne fonctionnait pas depuis un téléphone.

L'aléa est déplacé au moment de la génération. `npm run playgrounds`
(`scripts/build-playgrounds.mjs`) interroge Overpass cellule par cellule, avec cinq
reprises espacées, et écrit `public/data/playgrounds/` : un fichier par **cellule d'un
degré**, plus un `index.json` qui liste les cellules non vides et la date du relevé.
L'application ne charge que les trois ou quatre cellules que recouvre la vue, mises en
cache par le service worker.

Ce qu'on y gagne : affichage instantané, fonctionnement hors-ligne, aucun quota, aucune
panne de service tierce. Ce qu'on y perd : la donnée fige entre deux générations — le
script est à relancer de temps en temps, les aires de jeux bougent peu, et la date du
relevé est affichée en bas de chaque fiche.

Mêmes exigences d'accès que pour le RES, traduites en étiquettes OSM et appliquées à la
génération : `access` valant `private`, `customers`, `no`, `permit`, `members` ou
`residents` est écarté (`permissive` est conservé), ainsi que `indoor=yes` et `fee=yes`.
Une aire **sans** étiquette `access` est retenue : c'est le cas le plus fréquent, et
l'absence d'étiquette n'est pas une restriction. En revanche `lit` et `wheelchair` restent
filtrés à l'affichage, parce qu'une aire sans étiquette `lit` n'est pas une aire non
éclairée — elle est non renseignée.

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
n'importe quel hébergeur. Une seule contrainte : **servir en HTTPS**, sans quoi la
géolocalisation et le service worker sont désactivés par les navigateurs.

### Déploiement

Le site tourne sur un mutualisé **o2switch** (cPanel, Apache/LiteSpeed), servi à la racine
de `sportsderue.fr`. La mise en ligne est déclenchée par une **étiquette de version** :

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/deploiement.yml` construit le site, y joint
`deploy/o2switch/.htaccess`, l'envoie dans la racine publique, puis lance l'arbitre décrit
plus bas contre le site réellement servi. Un push sur `main` ne déploie rien : il ne
déclenche que `verification.yml`, qui vérifie que le build passe.

Deux transports sont possibles, choisis par la variable `DEPLOIEMENT_TRANSPORT` :

- **`ssh` (défaut)** — `rsync` par SSH, authentifié par clé. o2switch filtre SSH par liste
  blanche d'adresses IP alors que les runners GitHub en changent à chaque exécution : si le
  secret `O2SWITCH_CPANEL_TOKEN` est renseigné, le workflow **ouvre le pare-feu pour
  lui-même** avant de se connecter et le referme après, via l'API cPanel `SshWhitelist`
  (`scripts/parefeu-o2switch.sh`). Sans ce jeton, la connexion repose sur l'affirmation
  d'o2switch selon laquelle les plages GitHub « devraient déjà être en liste blanche ».
- **`ftps`** — `lftp` en FTPS explicite, TLS forcé et certificat vérifié. Aucun filtre sur
  le port 21, et l'identifiant peut être un **compte FTP secondaire cloisonné** sur la
  racine publique : rayon d'impact plus petit qu'en SSH, révocable en un clic.

`.github/workflows/test-connexion.yml` (Actions → Run workflow) tranche entre les deux en
lecture seule, sans rien déployer : à lancer avant la première étiquette. Les secrets
attendus pour chaque transport sont listés en tête de `deploiement.yml`.

Autres cibles, tenues à jour avec la précédente :

- **Serveur qu'on administre** — `deploy/Caddyfile` (le plus court, Caddy gère seul le
  certificat, la compression et les types MIME) ou `deploy/nginx/` (deux fichiers, voir le
  piège d'héritage des en-têtes signalé dedans).
- **Sous-chemin plutôt que racine** — passer `BASE_PATH=/mon-chemin/` au build : les URL
  d'assets, le `start_url`/`scope` du manifeste et le repli du service worker suivent
  automatiquement.

### Contrat de service

`dist/` est un site statique, mais **six règles doivent être tenues par l'hébergeur**, et
la plupart ne se voient pas quand elles sont fausses. Un mutualisé en assure deux sans
qu'on demande rien (le certificat, la compression) et laisse tout le reste au
`.htaccess` : c'est exactement ce qui rend un changement d'hébergeur risqué.

| Règle | Pourquoi | Ce qui arrive si on l'oublie |
|---|---|---|
| **HTTPS** | Contexte sécurisé exigé par les navigateurs | Ni géolocalisation ni service worker |
| **`/assets/*`, `/workbox-*.js` immuables** | Leur nom porte une empreinte du contenu | Rien de grave, juste du cache perdu |
| **`sw.js`, `index.html`, `manifest.webmanifest` toujours revalidés** | Seuls fichiers à nom stable : ce sont eux qui annoncent une version | **L'application installée reste figée**, sans rien signaler |
| **Compression** (gzip, mieux : brotli/zstd) | MapLibre pèse 936 ko bruts | ~4× plus de données sur mobile, invisible en fibre |
| **Types MIME** (`.webmanifest`, `.woff2`) | Le manifeste doit être reconnu | Installation en application compromise |
| **Repli page unique** | Toute URL inconnue rend `index.html` | 404 sur une URL mal recopiée |

Plus les en-têtes de sécurité (CSP, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, HSTS). `connect-src` y énumère les deux services
appelés depuis le navigateur — les aires de jeux, servies depuis le site, relèvent de
`'self'` : **toute nouvelle source de données doit y être ajoutée**, sinon ses appels sont
refusés par le navigateur.

Rien de tout cela ne se relit utilement. Après chaque mise en ligne, et impérativement
après un changement d'hébergeur :

```bash
npm run verifie-deploiement -- https://mon-site.fr
```

Le script contrôle les six règles et les en-têtes sur le site réel, quel que soit
l'hébergeur, et sort en erreur si une règle obligatoire n'est pas tenue.

## Architecture

```
src/
├── App.tsx                    état global (vue, filtres, sélection) et mise en page
├── types.ts                   modèle d'équipement, filtres, lieux
├── lib/
│   ├── dataes.ts              client Data ES : construction ODSQL, export GeoJSON, fiche
│   ├── playgrounds.ts         aires de jeux : lecture des cellules statiques
│   ├── sports.ts              taxonomie des sports (types, activités, emojis, couleurs)
│   ├── geocode.ts             recherche et géocodage inverse Géoplateforme
│   ├── geo.ts                 distances, emprises, liens d'itinéraire et de vue immersive
│   ├── cache.ts               cache mémoire des résultats par emprise + filtres
│   ├── appUpdate.ts           détection et application des nouvelles versions
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

- **Une requête par vue.** L'endpoint `exports/geojson` renvoie jusqu'à 1 500 équipements
  en un appel, là où `records` plafonne à 100. Au-delà de 1 500, la liste est signalée
  comme tronquée et le nombre réel est demandé séparément. Les aires de jeux suivent le
  même cycle sur leur propre effet, mais depuis les fichiers locaux, et sont plafonnées à
  900 à l'affichage.
- **Zoom minimum.** En dessous du zoom 10,5 l'emprise couvre trop de territoire : rien
  n'est chargé et l'interface invite à zoomer ou à chercher une commune.
- **Agrégats MapLibre.** Les épingles sont générées au `<canvas>` (bulle blanche cerclée de
  la couleur de la catégorie + emoji), puis enregistrées comme images de style.
- **Worker MapLibre.** MapLibre déduit l'URL de son worker de la sienne, ce qu'un bundler
  casse : `setWorkerUrl()` reçoit le worker construit par Vite (`?worker&url`), et
  `optimizeDeps.exclude` évite le pré-bundling en développement.
- **Mise à jour automatique.** Les noms de fichiers portent une empreinte du contenu, donc
  tout se joue sur `index.html` et `sw.js`, qui gardent le même nom : le `.htaccess` les
  fait revalider à chaque requête, et `src/lib/appUpdate.ts` redemande `sw.js` à chaque
  retour au premier plan (au plus une fois par minute) puis recharge la page dès que le
  nouveau service worker prend la main. Le rechargement ne perd rien, l'état de la vue
  étant dans l'URL. Sans cela, une application installée sur un téléphone ne fait aucune
  navigation pendant des jours et ne voit jamais la nouvelle version.

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
  pas de nom, et les équipements (`playground=slide`…) comme la tranche d'âge sont
  renseignés sur moins de 6 % d'entre elles. Leur relevé date de la dernière exécution de
  `npm run playgrounds`.
- La distance affichée est à vol d'oiseau, pas un temps de marche.
- Aucune photo n'est affichée dans la fiche : la fiche propose un lien « Voir la rue » vers
  la vue immersive, mais rien n'est intégré. Mesuré avec `npm run mesure-panoramax` : la
  seule source libre, Panoramax, ne couvre que 36 % des équipements en France (14 % en
  zone rurale), et trois photos sur quatre sont des 360° dont la vignette regarde la route
  plutôt que l'équipement.
- Pas encore : horaires d'ouverture (absents du RES), signalement d'erreur intégré,
  itinéraire dans l'application.

## Licence

Code sous licence MIT. Données Data ES et Géoplateforme sous
[Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab). Aires de jeux © les contributeurs
[OpenStreetMap](https://www.openstreetmap.org/copyright), sous ODbL. Application
indépendante, sans lien officiel avec le ministère chargé des Sports.
