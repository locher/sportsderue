# Notes pour Claude Code

Mémo de travail sur ce dépôt : conventions, pièges déjà rencontrés, décisions déjà
tranchées. Le [README](README.md) décrit le projet et son architecture — ce fichier ne le
répète pas, il complète.

## Le produit en une phrase

Carte mobile-first des équipements sportifs en accès libre et gratuit en France. On arrive,
on est géolocalisé, on voit ce qu'il y a autour, on filtre par sport en une tape, on peut
chercher une ville. Pas de compte, pas de backend, France uniquement.

Ce qui compte pour le propriétaire du projet : que ça marche depuis un téléphone, que ce
soit installable comme une application, et que ça reste gratuit à héberger.

## Conventions

- **Tout ce qui est visible est en français** : textes d'interface, commentaires du code,
  messages de commit, ce fichier. Les identifiants du code restent en anglais
  (`fetchEquipmentsInBbox`, `outdoorOnly`…), les champs de l'API gardent leurs noms
  d'origine (`equip_type_name`).
- Apostrophes typographiques (`’`) dans les textes affichés.
- Tailwind v4, jetons de thème dans `@theme` (`src/index.css`). Couleur de marque
  `#0f7b5f`. Pas de mode sombre : carte claire assumée.
- Icônes : SVG en ligne dans `Icons.tsx`, aucune dépendance d'icônes.
- Commits en français, corps expliquant le *pourquoi*. Pas de pull request sans demande
  explicite.

## Circuit de livraison

- Branche de travail : `claude/sports-equipment-mapping-france-7gnbnn`. C'est aussi la
  branche **par défaut** du dépôt (privé, propriétaire `locher`).
- **Netlify est branché sur le dépôt** : chaque push sur cette branche déclenche un build
  (`netlify.toml` : `npm run build` → `dist`) et met le site à jour en ~90 s. Rien d'autre
  à faire après un push, et aucun jeton n'est nécessaire.
- Corollaire : je n'ai pas d'accès Netlify, donc **je ne peux pas lire le résultat du
  build**. D'où la règle : toujours lancer `npm run build` localement avant de pousser.
- `.github/workflows/deploy-pages.yml` existe mais **ne déploie pas** : le build passe, puis
  `configure-pages` échoue (`Resource not accessible by integration` — créer le site Pages
  est un droit d'administrateur qu'un jeton de workflow n'a pas), et Pages sur un dépôt
  privé exige un compte GitHub Pro. Ne pas s'acharner dessus : c'est connu et accepté. Il
  fonctionnera tel quel si Pages est activé à la main ou si le dépôt passe en public.

## L'API Data ES, ce qu'il faut savoir avant d'y toucher

Opendatasoft Explore v2.1, dataset `data-es`, sans clé, CORS ouvert :
`https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es`

- ~334 000 enregistrements au total ; **118 224** après le filtre de base (accès libre +
  propriétaire public). Paris intra-muros : ~291. Île-de-France entière : ~6 100.
- **Littéraux entre guillemets doubles** dans les clauses ODSQL : beaucoup de valeurs
  contiennent une apostrophe (`Piste d'athlétisme isolée`). Attention, le jeu de données
  mélange apostrophes droites et typographiques (`Stade d’athlétisme`,
  `Parcours fixe de course d’orientation`) — **copier les chaînes exactement**, sinon la
  clause ne renvoie rien silencieusement.
- `aps_name` est **multivalué** et accepte `IN (...)` comme un champ simple.
- `in_bbox(equip_coordonnees, minLat, minLon, maxLat, maxLon)` — **latitude d'abord**.
  Autres outils disponibles : `within_distance(champ, geom'POINT(lon lat)', 1km)` et
  `distance(...)` utilisable dans `select` et `order_by`.
- `/records` plafonne à **100** résultats par appel (`-1 <= limit <= 100`). D'où l'usage de
  `/exports/geojson`, qui renvoie tout en un appel ; la géométrie vient du champ
  `equip_coordonnees`, les autres champs sélectionnés deviennent les `properties`.
- `/facets` ne renvoie que les **100 premières valeurs** d'une facette : ne pas en conclure
  qu'une liste est exhaustive.
- **Quota : 5 000 appels/jour et par IP**, remise à zéro à minuit UTC (en-têtes
  `x-ratelimit-*`). Les appels partant du navigateur de chaque visiteur, le compteur est
  individuel. Le 429 est géré avec un message en français.
  → **Ne jamais mettre de proxy sans cache devant l'API** : tout le trafic sortirait d'une
  seule IP et le quota deviendrait global. Si le projet décolle : passer à des PMTiles
  reconstruites chaque nuit (~56 Mo de GeoJSON brut, quelques Mo en tuiles), ce qui
  supprime la dépendance au quota et lève au passage le plafond de 1 500 et le zoom minimum.

Champs utiles : `equip_numero` (identifiant national), `equip_nom`, `inst_nom`,
`equip_type_name`, `aps_name`, `equip_coordonnees`, `equip_acc_libre`, `equip_prop_type`,
`equip_prop_nom`, `equip_nature`, `equip_eclair`, `equip_pmr_acc`, `equip_sol`,
`equip_long`/`larg`/`surf`, `equip_douche`/`sanit`/`vest_sport`, `equip_saison`,
`equip_obs`, `equip_service_date`, `equip_maj_date`, `new_name` (commune), `dep_nom`,
`reg_nom`. Les booléens sont des **chaînes** `"true"`/`"false"`.

`equip_nature` a exactement 8 valeurs : `Découvert`, `Découvrable`, `Extérieur couvert`,
`Intérieur`, `Site naturel`, `Site naturel aménagé`, `Site artificiel`, et `null`.

## Les autres services

- **Géocodage** : `https://data.geopf.fr/geocodage/search` et `/reverse`.
  `api-adresse.data.gouv.fr` est déprécié (il redirige en annonçant son retrait).
  Types renvoyés : `municipality`, `locality`, `street`, `housenumber`.
- **Fond de carte** : style vectoriel Plan IGN v2,
  `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json`,
  tuiles `/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf`, sans clé. Les seules polices disponibles
  dans les glyphes sont **`Source Sans Pro {Regular,Bold,Semibold,Italic}`** — `Noto Sans`
  renvoie 404, et un `text-font` inexistant fait disparaître les libellés d'agrégats.
  Une variante raster existe si besoin (WMTS, couche `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`).

## Pièges déjà payés — ne pas les repayer

1. **Worker MapLibre.** MapLibre déduit l'URL de son worker de la sienne, ce qu'un bundler
   casse. Symptôme : carte vide, aucune épingle, `isStyleLoaded()` faux, aucune erreur
   parlante, et un 404 sur `maplibre-gl-worker.mjs`. La solution en place tient en trois
   morceaux, à ne pas défaire : `setWorkerUrl()` avec un import
   `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`, `worker.format: 'es'` et
   `optimizeDeps.exclude: ['maplibre-gl']` dans `vite.config.ts`.
2. **Style en ligne contre React.** Dans `ResultsPanel`, le glissement écrit
   `style.transform` directement. Le remettre à `''` en fin de geste est un bug : React
   croit toujours à l'ancienne valeur, ne rediffuse rien, et la feuille reste ouverte. Il
   faut réécrire **exactement** la valeur attendue par le rendu.
3. **maplibre-gl v6 n'a pas d'export par défaut.** Imports nommés uniquement, la classe
   `Map` est réexportée en `MapLibreMap` (évite la collision avec `Map`).
4. **`types` explicite dans `tsconfig.json`** désactive l'inclusion automatique des
   `@types/*` : tout nouveau paquet de types doit y être ajouté à la main (`geojson`,
   `node` y sont pour cette raison).
5. **Vite 8 / rolldown** : `build.rolldownOptions.output.advancedChunks`, pas
   `manualChunks` (qui échoue au typage).
6. **Épingles** : dessinées au `<canvas>` (bulle blanche cerclée, emoji au centre) puis
   `map.addImage()`. Une image manquante ne lève pas d'erreur, elle n'affiche rien.

## Vérifier son travail dans cet environnement

Le navigateur du conteneur **n'a aucun accès réseau sortant** : toute requête HTTPS finit en
`ERR_CONNECTION_RESET`, y compris en passant `--proxy-server`. Inutile de chercher, c'est
l'environnement. En revanche `curl` fonctionne (via `HTTPS_PROXY`), et Node aussi avec
`NODE_USE_ENV_PROXY=1`.

La méthode qui marche, et qui a validé l'application de bout en bout :

1. capturer de **vraies réponses** avec `curl` (un export GeoJSON sur une emprise, une fiche
   `/records`, une recherche et un géocodage inverse, un glyphe `.pbf`) ;
2. lancer Playwright (installé globalement : `/opt/node22/lib/node_modules/playwright`,
   binaire `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, options
   `--no-sandbox --enable-unsafe-swiftshader`) en interceptant les appels réseau avec
   `context.route()` : les fixtures pour l'API, un style minimal (fond uni) à la place du
   style IGN, un 204 pour les tuiles ;
3. dérouler un parcours réel — accueil géolocalisé (`geolocation: {43.6047, 1.4442}` pour
   Toulouse), liste, fiche, filtre par sport, filtre « éclairé », recherche d'une autre
   ville, zone vide, retour à la position — et compter les erreurs console.

Le filtre d'interception peut rejouer le `where` reçu (extraire les `IN (...)`, la bbox, les
drapeaux) sur les fixtures : c'est ce qui permet de vérifier que les filtres produisent bien
des résultats différents. Ces scripts vivaient dans le répertoire de session (éphémère) :
ils ne sont pas dans le dépôt, il faut les recréer — compter une dizaine de minutes.

À vérifier en plus quand on touche à la requête : envoyer la clause `where` réellement
générée à l'API réelle avec `curl`. Toutes catégories cochées, elle fait ~2 150 caractères
(URL ~3 150) et répond 200 en ~1 s — mais une chaîne mal recopiée passe inaperçue autrement.

Deux détails d'outillage : `pkill -f vite` tue aussi le shell d'arrière-plan qui a lancé
Vite (code 144) — filtrer plus finement ; et pour attendre un événement, utiliser une
boucle `until` en tâche de fond plutôt qu'un long `sleep`.

## Invariants de l'application

Les modifier sans y penser dégrade l'expérience :

- Une seule requête par vue, avec anti-rebond de 400 ms et abandon de la précédente.
- `MAX_FEATURES = 1500` : au-delà, la liste est marquée tronquée et le total réel est
  demandé séparément pour l'annoncer.
- `MIN_ZOOM_FOR_DATA = 10.5` : en dessous, on ne charge rien et on invite à zoomer.
- Le cache réutilise une emprise déjà chargée qui **contient** la nouvelle (zoom avant
  gratuit) — un résultat tronqué n'est jamais réutilisé, il ne décrit pas toute son emprise.
- Zoom d'arrivée après géolocalisation : **13,6**. À 14,5 la vue ne fait que ~950 m de
  large et paraît vide.
- Les distances partent de la position GPS si le centre de la carte est à moins de 30 km,
  sinon du centre de la carte : sans ça, sélectionner un équipement change la distance
  affichée.
- La sélection ne recentre la carte que si le point est masqué (en-tête, feuille, hors
  écran).
- État partagé dans l'URL : `lat`, `lng`, `z`, `s` (sports), `f` (drapeaux), `e`
  (équipement). Filtres mémorisés sous `sportsderue.filters.v1`.

## Choix assumés, à ne pas « corriger »

- **Aucun backend, aucune clé d'API.** C'est ce qui rend l'hébergement gratuit.
- Filtre dur sur les propriétaires publics : les salles privées commerciales se déclarent
  aussi « en accès libre » (un Fitness Park remontait dans les premiers essais).
- Catégories nature (randonnée, escalade, baignade) décochées par défaut : 25 000 boucles
  de randonnée noieraient la carte urbaine.
- Le tennis de table extérieur passe par `aps_name`, faute de type dédié dans le RES ; cela
  remonte aussi des plateaux multisports équipés d'une table (~220 en France). C'est le
  maximum que la donnée permet.
- Pas de contrôle de zoom MapLibre (la colonne de droite est prise par les boutons
  flottants), attribution en bas à gauche décalée au-dessus de la feuille via `--sheet-h`.
- Pas d'ESLint, pas de tests unitaires : la vérification passe par le parcours Playwright
  ci-dessus.

## Pistes connues

Rien n'est engagé, mais les questions ont déjà été instruites :

- Montée en charge : PMTiles nocturnes (voir plus haut). Un cache en périphérie
  (Cloudflare Worker, normalisation de l'emprise sur une grille) n'est utile que s'il faut
  de la fraîcheur à la journée. Demander un relèvement de quota est gratuit et sans risque.
- Manques fonctionnels : horaires d'ouverture (absents du RES), photos, signalement d'une
  erreur de fiche, itinéraire piéton calculé (aujourd'hui c'est un lien vers l'application
  de cartographie du téléphone, et la distance est à vol d'oiseau).
- Vérification de build lisible côté GitHub : sortir l'étape `npm run build` du workflow
  Pages pour qu'elle passe au vert et serve de témoin sur chaque commit. Proposé, non
  retenu pour l'instant.
