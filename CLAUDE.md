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
- Tailwind v4, jetons de thème dans `@theme` (`src/index.css`). Voir « La charte visuelle »
  pour la palette. Pas de mode sombre : interface et carte claires assumées.
- Icônes : SVG en ligne dans `Icons.tsx`, aucune dépendance d'icônes.
- Commits en français, corps expliquant le *pourquoi*. Pas de pull request sans demande
  explicite.

## Circuit de livraison

- Branche de travail : `claude/sports-equipment-mapping-france-7gnbnn`. C'est aussi la
  branche **par défaut** du dépôt (privé, propriétaire `locher`). Une tâche peut désigner
  une autre branche (`claude/<sujet>-<suffixe>`) : dans ce cas elle **ne se déploie pas**,
  seule la branche par défaut est branchée sur Netlify. Il faut donc fusionner pour voir le
  résultat en ligne, et penser à récupérer la branche par défaut avant de commencer — elle
  avance aussi de son côté.
- **Netlify est branché sur le dépôt** : chaque push sur cette branche déclenche un build
  (`netlify.toml` : `npm run build` → `dist`) et met le site à jour en ~90 s. Rien d'autre
  à faire après un push, et aucun jeton n'est nécessaire.
- Corollaire : je n'ai pas d'accès Netlify, donc **je ne peux pas lire le résultat du
  build**. D'où la règle : toujours lancer `npm run build` localement avant de pousser.
  Le site lui-même est **protégé par mot de passe** (une requête anonyme renvoie 401 et une
  page « Login Redirect » vers `app.netlify.com/edge-access`) : inutile d'essayer de vérifier
  le déploiement en `curl`, ça ne dira jamais rien d'autre. La seule vérification possible
  de mon côté est locale, sur le serveur Vite (voir « Vérifier son travail »).
- **Netlify est le seul circuit de déploiement**, et le dépôt n'a plus aucun workflow GitHub
  Actions. Un déploiement automatique sur GitHub Pages a existé
  (`.github/workflows/deploy-pages.yml`) : il ne publiait jamais — `configure-pages` échouait
  (`Resource not accessible by integration`, créer le site Pages est un droit
  d'administrateur qu'un jeton de workflow n'a pas) et Pages sur un dépôt privé exige un
  compte GitHub Pro. Supprimé en août 2026 ; ne pas le remettre sans demande explicite.

## La mise à jour doit rester automatique

Signalée depuis un téléphone : il fallait vider le cache du navigateur à la main pour voir
une nouvelle version. Le service worker n'était pas en cause — Workbox pose déjà
`skipWaiting()` et `clientsClaim()`, la relève se fait dès qu'une version est *détectée*.
Deux trous, à ne pas rouvrir :

1. **Rien ne redéclenchait la détection.** `registerSW({ immediate: true })` interroge
   `sw.js` au chargement de la page et plus jamais. Une application installée est rouverte
   depuis l'arrière-plan pendant des jours **sans une seule navigation** : la nouvelle
   version n'était donc jamais vue. D'où la vérification à chaque retour au premier plan
   (`visibilitychange`, au plus une fois par minute) et l'intervalle horaire de secours.
2. **La page ouverte gardait l'ancienne version en mémoire.** Prendre le contrôle ne
   réexécute pas le JavaScript déjà chargé ni ne réapplique la feuille de style. En mode
   application il n'y a pas de bouton « recharger » : sans écoute de `controllerchange`
   suivie d'un `location.reload()`, on ne s'en sortait plus. Le rechargement ne perd rien,
   l'état de la vue vivant dans l'URL — c'est ce qui autorise à le faire sans rien demander.

Deux garde-fous dans `src/lib/appUpdate.ts`, à conserver : ne pas recharger si aucun
service worker ne pilotait la page (première visite : la prise de contrôle n'apporte rien à
montrer, ce serait un clignotement gratuit), et un drapeau contre un second rechargement.

Côté serveur, `netlify.toml` : les fichiers à empreinte (`/assets/*`, `/workbox-*.js`) sont
immuables, et les trois qui gardent leur nom d'une version à l'autre — `sw.js`,
`index.html`, `manifest.webmanifest` — sont **toujours revalidés**. Un `max-age` sur l'un
d'eux et la mise à jour ne part plus.

Vérifiable de bout en bout sans raccourcir les constantes livrées : servir un `dist`
depuis un répertoire, ouvrir la page, reconstruire par-dessus avec un `<title>` différent,
attendre 65 s, émettre un `visibilitychange` caché puis visible, et vérifier que le titre
a changé tout seul. Compter les rechargements : il doit y en avoir exactement **un**.

## La charte visuelle

Refondue en août 2026. La version précédente — vert institutionnel, rayons courts, boutons
en dégradé — faisait daté. Le principe tient en une phrase : **trois matières seulement,
aucun dégradé, et la couleur restante appartient aux sports**.

- `--color-ink` `#141a17` (encre presque noire), le blanc, `--color-canvas` `#f1f4ee` pour
  les cartes posées sur du blanc, et `--color-lime` `#d6fb4f` comme unique accent.
- **Pas de dégradé, nulle part.** C'est le repère principal : un `linear-gradient` sur un
  bouton ou un bandeau et l'interface reprend dix ans. Les aplats font le travail.
- Rayons larges et assumés : feuilles `40 px`, cartes `26 px`, tuiles `22 px`, boutons
  ronds. En dessous de `20 px`, ça cesse de fonctionner.
- Ombres douces et rares (`--shadow-float`, `--shadow-sheet`, `--shadow-lift`) : elles
  détachent du fond de carte, elles ne créent pas de relief.
- Typographie **Archivo Variable**, auto-hébergée depuis `src/assets/fonts` (deux
  sous-ensembles latins, ~90 ko chacun, copiés de `@fontsource-variable/archivo`). Les
  `@font-face` sont écrits à la main dans `index.css` plutôt qu'importés du paquet : le
  `globPatterns: ['**/*.woff2']` du service worker précacherait sinon **tous** les
  alphabets (vietnamien, cyrillique, grec…). Deux classes portent le ton : `.display`
  (titres, 800, resserrés) et `.eyebrow` (sur-titres capitales espacées).
- Mouvement discret mais présent : `--ease-spring` à l'appui (classe `.springy`), cascade
  `.animate-rise` sur les cartes, halo battant sous l'épingle sélectionnée. Tout est
  neutralisé par `prefers-reduced-motion`, y compris le halo (qui vérifie la préférence en
  JavaScript, une animation `requestAnimationFrame` échappant à la règle CSS).

Chaque sport porte **trois** couleurs dans `sports.ts`, et confondre leurs rôles se voit
tout de suite :

- `color` — teinte d'identité, utilisée en fond très transparent (`${color}1f`) ;
- `vivid` — l'aplat vif : épingles, puces actives, tuiles de filtres, pastilles ;
- `deep` — assombri jusqu'à garantir 4,5:1 avec du **blanc**, pour les grandes surfaces
  (bandeau de la fiche d'équipement).

Sur un aplat `vivid`, ne pas choisir la couleur du texte à la main : `readableOn(hex)`
renvoie l'encre ou le blanc selon le contraste réel. C'est ce qui permet de garder un jaune
de volley et un violet de skate côte à côte sans en rendre un illisible.

## Le fond de carte est retraité, pas repris tel quel

`src/lib/mapTheme.ts` charge le style Plan IGN **« épuré »** (`epure.json`, pas
`standard.json` : 321 couches au lieu de 425, et pas de couleurs touristiques à défaire)
puis le recolore avant de le donner à MapLibre.

Le retraitement ne réécrit pas les couches : il **traverse récursivement les valeurs de
`paint`** et transforme chaque couleur rencontrée, expressions comprises. La hiérarchie des
routes et les variations selon le zoom sont donc conservées intactes — c'est ce qui
distingue cette approche d'un aplatissement en couleur fixe, qui les détruirait.

Une « recette » par famille de `source-layer` impose teinte et saturation, et comprime la
clarté (`base + range × clarté d'origine`). Points à connaître :

- **L'ordre des préfixes compte** : le premier qui correspond gagne, donc `bati_zone` (les
  îlots urbains, qui couvrent de grandes surfaces) doit passer avant `bati`. Inversé, les
  villes deviennent une masse grise.
- `keepWhite` n'est activé que pour `routier` : c'est le blanc franc des routes sur une
  terre plus sourde qui dessine la trame. Sur `bati`, le même réglage rendait les bâtiments
  plus clairs que la terre.
- La terre doit rester la surface **la plus claire** de la carte ; tout le reste s'en écarte
  à peine, sauf la végétation (tirée vers le lime de l'application) et l'eau.
- Les libellés sont réaffectés par famille, sauf les numéros de route : ils sont écrits en
  clair sur une pastille sombre, et les repeindre en encre les efface. D'où le test sur la
  clarté d'origine avant réaffectation.

Et le piège qui coûte une carte vide : **`map.setStyle()` repart d'une feuille vierge** —
sources, couches *et* images ajoutées disparaissent. Comme le style thématisé arrive après
la création de la carte (style provisoire à la bonne couleur de terre en attendant),
l'installation des couches doit être **idempotente et rejouée à chaque `styledata`**, et
relire les données courantes depuis des refs (`itemsRef`, `selectedIdRef`) — un `useEffect`
ne se redéclenche pas, lui. Le chien de garde ne peut plus tester `isStyleLoaded()` non
plus (vrai dès le style provisoire) : il vérifie la présence de la source `plan_ign`.

En cas d'échec du retraitement, repli sur l'URL brute du style : carte non thématisée mais
application utilisable.

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
- Certains libellés d'`aps_name` ont été **coupés sur une virgule** à l'import : la pelote
  basque existe sous deux valeurs distinctes,
  `Cesta punta/Mains nues/Pala/Chistera (grande` et
  `joko garbi)/Paleta/Xare/Frontenis/Pala corta/Rebot`. Il faut les deux. Ne pas « réparer »
  la chaîne : c'est bien ainsi qu'elle est stockée.
- **ODSQL n'a pas de littéral booléen** : `FALSE` comme `false`, seuls dans une clause,
  sont des erreurs de syntaxe (400). Pour une clause toujours fausse, écrire `1 = 2`.
- `aps_name` est **multivalué** et accepte `IN (...)` comme un champ simple. C'est ce qui
  permet de chercher par activité praticable (voir plus bas).
- `equip_nature != "Intérieur"` **exclut aussi les valeurs nulles** (~750 enregistrements).
  Pour garder les nuls, il faut expliciter `OR equip_nature IS NULL`.
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

## Chercher par type *et* par activité

Le RES décrit un équipement de deux façons : ce qu'il **est** (`equip_type_name`) et ce
qu'on **peut y pratiquer** (`aps_name`). Un city-stade est un équipement unique —
`Multisports/City-stades` — qui déclare le plus souvent basket, foot, hand et volley.
Chercher sur le type seul le rendait introuvable sous le filtre « Basket », d'où des vues
quasi vides en ville. `categoriesPredicate()` dans `dataes.ts` interroge donc les deux.

Ordres de grandeur (France, après le filtre de base) : handball 751 → 12 408,
basket 4 084 → 17 732, volley 1 075 → 4 907, football 16 024 → 28 226. L'écart est nul là
où le sport a son propre terrain : pétanque 20 952 → 21 416. La vue par défaut, elle, ne
bouge quasiment pas (+0,3 %) : ces équipements étaient déjà sur la carte.

Trois règles qui vont ensemble — en défaire une casse l'équilibre :

1. **L'affichage reste piloté par le type.** `categoryOf()` regarde `equip_type_name`
   d'abord : un city-stade retrouvé via « Basket » garde son épingle de city-stade. Il
   n'est **pas** éclaté en une épingle par activité — demande explicite du propriétaire.
   `practicableMatches()` sert seulement à afficher « 🏀 Basket praticable » dans la liste,
   et seulement quand la catégorie propre de l'équipement n'est pas cochée.
2. **Les correspondances par activité sont restreintes au plein air.** Le type est un
   signal fort, l'activité un signal faible : un gymnase peut déclarer dix activités et
   remonter sous dix filtres. Hors salle pour les catégories urbaines, sites naturels
   compris pour les catégories nature (une baignade aménagée n'est ni « Découvert » ni en
   salle). Coût réel : 2,6 % des résultats basket.
3. **Toutes les activités ne se rattachent pas.** `Vtt (Cross Country/…)` est volontairement
   absente des catégories urbaines : 9 300 des 12 300 équipements qui la déclarent sont des
   boucles de randonnée. Avant d'ajouter une valeur à `sports`, vérifier sur quels
   `equip_type_name` elle atterrit réellement (`group_by=equip_type_name`).

Les valeurs sont mises en commun entre catégories dans la clause plutôt qu'un prédicat par
catégorie : résultat identique, URL deux fois plus courte.

## Les aires de jeux ne sont pas dans le RES

Question déjà instruite, réponse ferme : **le RES ne recense que du sport**. Ses 185 valeurs
de `equip_type_name` ne contiennent aucune aire de jeux ; la plus proche,
`Parc Mobil'Ludique` (144 enregistrements), est une piste d'éducation routière — ses
`aps_name` disent `Cyclisme sur route/Vélo Couché`. `search(equip_type_name, "jeu")` renvoie
0. Côté data.gouv.fr, rien de national : deux jeux de données communaux (Anglet,
Fleury-les-Aubrais). Ne pas rechercher, c'est fait.

La couverture vient donc d'**OpenStreetMap** (`leisure=playground`) via Overpass :
**45 922** objets en France, dont deux tiers en polygones — `nwr` + `out center` les ramène
tous à un point. `src/lib/overpass.ts`.

Ce qu'il faut savoir avant d'y toucher :

- **Overpass n'est pas Opendatasoft.** Service bénévole, 2 à 15 s de réponse, et des pannes
  régulières : 504 de passerelle, ou **200 avec une page HTML** « too busy » (d'où la
  validation du corps, pas seulement du statut). Mesuré sur place pendant le développement :
  trois échecs sur huit appels. Une seule reprise, à 1,5 s — insister sur un service saturé
  l'aggrave. Quota : 2 créneaux simultanés par IP, un 429 quand on les dépasse.
- **Les miroirs sont pires, ne pas les remettre** : `overpass.kumi.systems` répond 504 après
  deux minutes, `overpass.private.coffee` met 56 s et sert des données vieilles d'un mois.
- **Trois précautions qui vont ensemble** : catégorie décochée par défaut (seuls ceux qui la
  cochent paient l'appel), effet **séparé** de celui de Data ES dans `useEquipments` (une
  lenteur d'OSM ne doit jamais retenir les terrains de basket), et échec en simple
  **avertissement** au-dessus de la liste — jamais en erreur bloquante.
- **La requête ne porte qu'un seul critère de tag**, `leisure=playground`, et rien
  d'autre. Tout le reste du tri se fait à la réception. Ce n'est pas un choix de style :
  les exclusions d'accès étaient d'abord posées dans la requête en `["access"!~"…"]`, et
  une expression `!~` **interdit à Overpass d'utiliser son index de tags** — il balaie
  alors toute l'emprise. Mesuré sur une vue de 346 km² autour de Valence, la même requête
  passe de **19,1 s à 1,4 s** une fois les `!~` retirés. C'est ce qui rendait la catégorie
  inutilisable sur un téléphone (signalé depuis le terrain, le message affiché était
  « OpenStreetMap n'a pas répondu à temps »). Décomposition mesurée des 19 s : ~2,4 s de
  recherche, ~5,7 s pour `out center`, ~8 s pour les seules expressions `!~`.
  Ne pas les y remettre. Le tri client coûte 8 % de données en plus (18 ko → 20 ko).
- **Deux tris côté client, pour deux raisons différentes** — ne pas les confondre :
  - `access` (`private|customers|no|permit|members|residents`, `customers` élimine les
    aires de McDonald's), `indoor=yes` et `fee=yes` : c'est le miroir du filtre
    « propriétaire public » du RES. L'absence d'étiquette vaut autorisation, c'est le cas
    majoritaire. Déplacé côté client **pour la vitesse**, à résultat identique — vérifié
    sur l'emprise de Valence : 114 objets reçus, 107 retenus, exactement comme la requête
    filtrée d'avant.
  - `lit` et `wheelchair` : ceux-là ne pourraient **pas** être posés côté serveur sans
    mentir. Une aire sans étiquette `lit` n'est pas une aire non éclairée, elle est non
    renseignée — le filtre ferait passer une lacune de saisie pour une réponse.
- **Le piège du relais Playwright** : Overpass répond **406** à `User-Agent: node`, celui
  que Node met par défaut. Le relais doit réexpédier les en-têtes du navigateur. Ce n'est
  pas un bug de l'application — un vrai navigateur passe.
- Nom et type sont volontairement **identiques** (`Aire de jeux`) quand OSM n'a pas de nom,
  ce qui est le cas trois fois sur quatre : `sameLabel()` (`src/lib/text.ts`) évite alors
  d'écrire deux fois la même ligne dans la liste et dans le bandeau de la fiche.
- La fiche d'une aire de jeux **ne déclenche aucun appel** : la réponse de liste porte déjà
  toutes les étiquettes. Seul un lien partagé (`?e=osm:way/123`) en demande un.
- L'emoji 🛝 est **Unicode 15** (2022) : iOS 16.4+, Android 14+. C'est le plus récent de la
  taxonomie, qui exigeait jusque-là Unicode 11. Sur un appareil plus ancien, il tombera en
  tofu — accepté, aucun autre emoji ne dit « aire de jeux ».

L'attribution ODbL est posée dans le contrôle d'attribution de MapLibre **en permanence**,
pas seulement quand la catégorie est cochée : plus simple, et jamais faux.

## Les autres services

- **Géocodage** : `https://data.geopf.fr/geocodage/search` et `/reverse`.
  `api-adresse.data.gouv.fr` est déprécié (il redirige en annonçant son retrait).
  Types renvoyés : `municipality`, `locality`, `street`, `housenumber`.
- **Fond de carte** : styles vectoriels Plan IGN v2 sous
  `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/`, tuiles
  `/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf`, sans clé. Six variantes répondent 200 :
  `standard`, `epure`, `attenue`, `gris`, `classique`, `accentue` (`essentiels` et
  `sans-toponymes` n'existent pas). L'application part de `epure` et le recolore — voir
  « Le fond de carte est retraité ». Les seules polices disponibles dans les glyphes sont
  **`Source Sans Pro {Regular,Bold,Semibold,Italic}`** — `Noto Sans` renvoie 404, et un
  `text-font` inexistant fait disparaître les libellés d'agrégats. Une variante raster
  existe si besoin (WMTS, couche `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`).

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
6. **Épingles** : dessinées au `<canvas>` (goutte pleine en `vivid`, pastille blanche
   portant l'emoji) puis `map.addImage()`. Une image manquante ne lève pas d'erreur, elle
   n'affiche rien. Les regroupements, eux, sont des couches `circle` : pas de dégradé
   possible, la profondeur vient d'une lueur lime posée sous le disque d'encre.
7. **Géolocalisation sur iOS.** Signalé depuis un iPhone : aucune demande d'autorisation
   n'apparaît jamais et l'application annonce un refus, alors que tout va bien sur
   ordinateur. `status` ne passe à `'denied'` que sur `PERMISSION_DENIED` (code 1) : le
   navigateur a donc répondu **sans rien demander**, et le blocage est au-dessus de la page.
   Deux familles de causes, à ne pas confondre :
   - **Réglages du système** (le plus fréquent, et le code n'y peut rien) : *Confidentialité
     et sécurité → Service de localisation* coupé ou *Safari* sur « Jamais », ou
     *Apps → Safari → Localisation* sur « Refuser ». Le message de refus nomme donc ces
     écrans sur iOS, il ne dit pas « les réglages de votre navigateur ».
   - **Absence de geste utilisateur** : la demande du démarrage part d'un `useEffect`
     (`App.tsx`), sans activation derrière elle — c'est le cas fragile sur WebKit, bien plus
     permissif sur ordinateur. D'où le bouton **« Réessayer »** dans le bandeau : une tape
     fournit l'activation qui manquait. Ne pas le retirer, c'est la seule porte de sortie
     depuis un téléphone.

   Le `timeout` compte aussi le temps passé sur la feuille d'autorisation : à 10 s un
   TIMEOUT tombait pendant que la personne lisait. Il est à 20 s, ne pas le redescendre.

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

Variante plus simple que les fixtures, et **c'est celle à privilégier** : au lieu de
capturer des réponses à l'avance, **relayer** l'appel dans le `context.route()` — `fetch()`
côté Node (avec `NODE_USE_ENV_PROXY=1`) puis `route.fulfill()`. Le navigateur voit de
vraies données fraîches sans sortir du conteneur.

Contrairement à ce qui était noté ici, il n'y a **pas besoin de remplacer le style IGN par
un style minimal** : en relayant tout `data.geopf.fr` — style, glyphes *et* tuiles `.pbf`
en binaire (`Buffer.from(await res.arrayBuffer())`) — on obtient le vrai fond de carte dans
la capture. C'est ce qui a permis de juger la charte visuelle sur pièces. Une trentaine de
lignes suffit :

```js
await ctx.route('**://*/**', async (route) => {
  const req = route.request()
  const u = req.url()
  if (u.startsWith('http://127.0.0.1:5188')) return route.continue()
  if (!/^https:\/\/(data\.geopf\.fr|equipements\.sports\.gouv\.fr|overpass-api\.de)\//.test(u)) {
    return route.abort() // tout le reste (télémétrie Chromium) est coupé
  }
  // Overpass est appelé en POST, et répond 406 au `User-Agent: node` de Node :
  // il faut relayer le corps *et* les en-têtes du navigateur.
  const headers = { ...req.headers() }
  for (const k of ['host', 'connection', 'content-length', 'accept-encoding']) delete headers[k]
  const res = await fetch(u, { method: req.method(), headers, body: req.postData() ?? undefined })
  route.fulfill({
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? '' },
    body: Buffer.from(await res.arrayBuffer()),
  })
})
```

Mettre la clé de cache sur `(méthode, URL, corps)` et non sur l'URL seule, sinon toutes les
requêtes Overpass se confondent — et la reprise sur erreur rejoue le même échec en cache.

Mettre les réponses en cache dans une `Map` : sans cela une vue urbaine relaie une centaine
de tuiles à chaque capture. Options Chromium qui marchent avec MapLibre :
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox`.

À vérifier en plus quand on touche à la requête : envoyer la clause `where` réellement
générée à l'API réelle avec `curl`. Toutes catégories cochées, elle fait ~3 480 caractères
(URL ~4 800) et répond 200 en ~1 s — mais une chaîne mal recopiée passe inaperçue autrement.
Le plus sûr est de bundler `dataes.ts` avec esbuild et d'appeler le vrai `buildWhere()`
depuis Node, catégorie par catégorie : une valeur d'`aps_name` erronée ne fait pas d'erreur,
elle renvoie juste moins de résultats.

Détails d'outillage :

- `pkill -f vite` tue aussi le shell d'arrière-plan qui a lancé Vite (code 144) — filtrer
  plus finement. **Vrai aussi pour `pkill -f "vite preview"` :** le motif correspond à la
  ligne de commande du shell appelant lui-même. Servir chaque version sur un port distinct
  plutôt que tuer le serveur précédent.
- Playwright est bien installé globalement, mais un script placé ailleurs (répertoire de
  session) **ne le résout pas** : importer par chemin absolu ou passer `NODE_PATH`.
  `/opt/pw-browsers/chromium` est un lien vers le binaire, plus court à écrire.
  Selon l'image, `require.resolve('playwright')` peut échouer et le paquet exposer du
  CommonJS (`import pw from '…/playwright/index.js'; const { chromium } = pw`) : le plus
  robuste est de faire un `npm install playwright` **dans le répertoire de session**, pas
  dans le dépôt — un `npm install` du projet élague les paquets installés en `--no-save` et
  casse le script de capture en cours de route.
- Pour comparer avant/après, `git worktree add --detach <dir> <ref>` avec un lien
  symbolique vers `node_modules` — **jamais `git stash`** : si la commande casse en cours
  de chaîne, le travail reste dans la pile et l'arbre paraît propre.
- La feuille de résultats ne se déplie pas au `click()` : le gestionnaire de glissement
  avale l'événement. Reproduire le geste sur son en-tête
  (`[aria-label="Liste des équipements"] > div:first-child` : `mouse.down`, `mouse.move`
  vers le haut de ~340 px, `mouse.up`), puis attendre `aria-expanded="true"`.
- Pour attendre un événement, utiliser une boucle `until` en tâche de fond plutôt qu'un
  long `sleep`.

## Invariants de l'application

Les modifier sans y penser dégrade l'expérience :

- Une seule requête par vue **et par base**, avec anti-rebond de 400 ms et abandon de la
  précédente.
- Aucune catégorie cochée : **aucun appel n'est envoyé**, la liste est vide par
  construction. (Avant, la clause `AND FALSE` partait à l'API et revenait en 400.) Vrai base
  par base : cocher « Jeux » seul n'envoie rien à Data ES, et décocher « Jeux » n'envoie
  rien à Overpass — `categoriesBySource()` fait la répartition.
- `MAX_FEATURES = 1500` : au-delà, la liste est marquée tronquée et le total réel est
  demandé séparément pour l'annoncer. `MAX_PLAYGROUNDS = 900` côté Overpass (Paris entier
  en compte ~1 400) ; quand les aires de jeux sont tronquées, le total n'est **pas**
  affiché — il ne compte que le RES et serait faux.
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
- La position d'aperçu de la feuille n'est **pas** une constante : elle vaut la hauteur
  réelle de l'en-tête, mesurée au `ResizeObserver`. Une valeur en dur laissait dépasser un
  bout de carte tronqué dès que le titre passait sur deux lignes.
- État partagé dans l'URL : `lat`, `lng`, `z`, `s` (sports), `f` (drapeaux), `e`
  (équipement). Filtres mémorisés sous `sportsderue.filters.v1`.

## Choix assumés, à ne pas « corriger »

- **Aucun backend, aucune clé d'API.** C'est ce qui rend l'hébergement gratuit.
- Filtre dur sur les propriétaires publics : les salles privées commerciales se déclarent
  aussi « en accès libre » (un Fitness Park remontait dans les premiers essais).
- Catégories nature (randonnée, escalade, baignade) décochées par défaut : 25 000 boucles
  de randonnée noieraient la carte urbaine.
- « Jeux » décochée par défaut aussi, mais pour une autre raison : c'est le coût imposé à
  Overpass, pas le volume affiché (58 aires sur une vue de Toulouse, contre 61 équipements
  sportifs — l'équilibre est bon).
- **On cherche par type d'équipement *et* par activité praticable** (voir « Chercher par
  type *et* par activité »). Ne pas revenir au type seul : c'est ce qui rendait les
  city-stades introuvables sous « Basket ».
- Le tennis de table extérieur n'a pas de type dédié dans le RES : sa catégorie repose
  entièrement sur `aps_name`. Cela remonte aussi des plateaux multisports équipés d'une
  table (~220 en France). C'est le maximum que la donnée permet.
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
- Vérification de build lisible côté GitHub : un workflow qui ne fait que `npm run build`,
  pour avoir un témoin vert sur chaque commit sans rien déployer. Proposé, non retenu pour
  l'instant (le dépôt n'a aujourd'hui aucun workflow).
