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

- Une seule branche : **`main`**, branche par défaut du dépôt (privé, propriétaire
  `locher`). Une tâche peut désigner une branche de travail (`claude/<sujet>-<suffixe>`) :
  elle ne déploie rien et doit être fusionnée dans `main`. Penser à récupérer `main` avant
  de commencer, elle avance aussi de son côté.
- **Rien ne se déploie sur un push.** La mise en ligne est déclenchée par une **étiquette
  de version** (`git tag v1.2.0 && git push origin v1.2.0`), qui lance
  `.github/workflows/deploiement.yml` : build, `.htaccess` joint au site, envoi en `rsync`
  par SSH vers o2switch, puis `verifie-deploiement` contre le site réellement servi. C'est
  volontaire — une application installée qui reçoit une version cassée n'a pas de bouton
  « recharger », donc la mise en ligne doit être un geste explicite.
- Un push sur `main` (ou une pull request vers elle) ne déclenche que
  `.github/workflows/verification.yml` : `npm run build`, donc `tsc --noEmit` puis Vite.
  C'est le témoin vert, il ne publie rien.
- **La règle du build local tient toujours** : lancer `npm run build` avant de pousser. À
  savoir quand même, ça change la façon de travailler : les journaux d'Actions sont
  lisibles depuis ici (outils GitHub `actions_list`, `get_job_logs`), donc un échec de CI
  se diagnostique sans avoir à demander une capture d'écran.
- **Le site est public** (`sportsderue.fr`), sans mot de passe. C'est un vrai changement
  pour moi : `curl` et `npm run verifie-deploiement -- https://sportsderue.fr` marchent
  depuis le conteneur (avec `NODE_USE_ENV_PROXY=1` pour le second, qui passe par `fetch`),
  donc je peux enfin contrôler ce qui est réellement servi. Non encore exercé contre ce
  domaine : il a été délégué le 17 août 2026 et ne résolvait pas encore. Pour diagnostiquer
  un domaine muet sans `dig` dans le conteneur, interroger le DNS en HTTPS
  (`https://dns.google/resolve?name=…&type=NS`) et l'état de l'enregistrement en RDAP
  (`https://rdap.nic.fr/domain/…`) : c'est ce qui distingue « pas encore propagé » de
  « mal configuré ».
- **Piège o2switch à connaître** : l'accès SSH est filtré par liste blanche d'adresses IP
  (outil « Autorisation SSH » de cPanel), et les runners GitHub changent d'IP à chaque
  exécution. Le filtre doit avoir été levé par le support pour le compte, sinon le
  déploiement échoue en délai d'attente sans autre explication. Si le support refuse, la
  solution de repli est le même workflow en FTPS (`lftp mirror --delete`), que la liste
  blanche ne concerne pas.
- Un déploiement automatique sur GitHub Pages a existé
  (`.github/workflows/deploy-pages.yml`) : il ne publiait jamais — `configure-pages`
  échouait (`Resource not accessible by integration`, créer le site Pages est un droit
  d'administrateur qu'un jeton de workflow n'a pas) et Pages sur un dépôt privé exige un
  compte GitHub Pro. Supprimé en août 2026 ; ne pas le remettre.

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

Côté serveur, `deploy/o2switch/.htaccess` : les fichiers à empreinte (`/assets/*`,
`/workbox-*.js`) sont immuables, et les trois qui gardent leur nom d'une version à l'autre
— `sw.js`, `index.html`, `manifest.webmanifest` — sont **toujours revalidés**. Un
`max-age` sur l'un d'eux et la mise à jour ne part plus.

Vérifiable de bout en bout sans raccourcir les constantes livrées : servir un `dist`
depuis un répertoire, ouvrir la page, reconstruire par-dessus avec un `<title>` différent,
attendre 65 s, émettre un `visibilitychange` caché puis visible, et vérifier que le titre
a changé tout seul. Compter les rechargements : il doit y en avoir exactement **un**.

## La position suit le mouvement

Signalée depuis un téléphone (ticket #9) : la position affichée était juste mais **figée**.
On marchait, le point restait au départ. `getCurrentPosition` ne mesure qu'une fois, et
rien ne redemandait jamais.

Deux mécanismes désormais, et ils ne font pas le même travail — ne pas les confondre :

- **`getCurrentPosition`** (`locate()`) obtient le *premier* point. C'est lui qui déclenche
  la demande d'autorisation, lui qui porte les messages d'erreur et le bouton
  « Réessayer », lui qui garde `enableHighAccuracy: false` et son `timeout` de 20 s : ce
  qui compte à l'arrivée, c'est d'avoir un point vite.
- **`watchPosition`** prend le relais, démarré seulement **après** un premier point obtenu
  (l'autorisation est alors acquise, il n'y a plus rien à demander). Réglages inverses :
  `enableHighAccuracy: true` — sans elle la position vient du Wi-Fi et ne bouge pas d'un
  pas à l'autre, le suivi n'aurait rien à suivre — `maximumAge: 0`, et **pas de
  `timeout`** : il ferait remonter une erreur à chaque mesure manquée alors qu'on a déjà un
  point valable. Ses erreurs sont donc traitées à l'inverse aussi : un tunnel n'est pas une
  panne, on garde le dernier point ; seul `PERMISSION_DENIED` arrête le suivi (une
  autorisation peut être retirée en cours de route).

Trois garde-fous, chacun contre une dépense qui ne se voit pas :

1. **Seuil de 8 m** (`MOVE_EPSILON_M`). Un appareil immobile « danse » de quelques mètres
   d'une mesure à l'autre, et tout descend de cette valeur : marqueur déplacé, carte
   recentrée, distances recalculées, liste retriée. Huit mètres, c'est sous la précision
   courante en ville et au-dessus du frémissement.
2. **Suivi en pause page masquée**, relancé au retour au premier plan. La haute précision
   coûte de la batterie, et en arrière-plan il n'y a rien à montrer.
3. **Verrou de 25 m sur `origin`** (App). Le marqueur doit suivre au mètre près, la liste
   non : les distances sont arrondies à dix mètres et chaque changement de référence retrie
   puis rediffuse jusqu'à 1 500 lignes. Le verrou de valeur décrit plus bas est donc devenu
   un verrou à **tolérance** (voir « Ce qui doit garder son identité »).

**La carte, elle, ne suit que si `followUser` est vrai** — après une tape sur « Me
localiser », ou au premier chargement. Elle glisse quand le point dérive de plus de
`FOLLOW_SLACK_PX` (6 px) du centre : au zoom d'arrivée, 8 m valent moins de deux pixels, et
animer pour cela déclencherait une salve d'événements (`moveend`, URL réécrite, emprise
recalculée) sans que rien ne bouge à l'écran. Le `easeTo` du suivi n'est **pas**
`essential` : sous `prefers-reduced-motion`, MapLibre recentre alors d'un coup au lieu de
glisser — le suivi fonctionne, sans le mouvement.

Et le piège qui a coûté le plus de temps : **`movestart` ne dit pas qui a bougé la carte**.
Le suivi s'arrêtait sur son *propre* premier recentrage, et le bouton « Me localiser »
s'éteignait dans la seconde qui suivait la tape (bug déjà présent avant le suivi, avec le
vol d'arrivée). Seuls les gestes portent un **`originalEvent`** — vérifié dans la source de
MapLibre : le gestionnaire de gestes le réexpédie, `easeTo`/`flyTo` fabriquent l'événement
avec les seules `eventData` de l'appel. D'où la règle en place :

- geste (glissement, pincement, molette, clavier) → `originalEvent` présent → reprise en
  main, le suivi rend la main ;
- déplacement programmé → aucun `originalEvent`, le suivi continue ;
- sauf les deux déplacements programmés qui *veulent dire* « je regarde ailleurs » : le
  dépliage d'un regroupement appelle `onUserMove()` explicitement, et `focus()` renvoie
  désormais s'il a bougé la carte — App n'arrête le suivi que dans ce cas, si bien
  qu'ouvrir une épingle déjà visible ne l'interrompt pas.

Vérifié au navigateur, et c'est reproductible : **`ctx.setGeolocation()` de Playwright
réveille bien `watchPosition`**, il n'y a pas besoin de simuler l'API. Trois parcours de la
méthode décrite plus bas (relais réseau, `geolocation` accordée, Toulouse) : marche de
200 m par pas de 25 m puis glissement puis « Me localiser » ; frémissement de 5 m puis pas
de 30 m avec une fiche ouverte ; et mise en pause — `visibilityState` n'étant pas pilotable
depuis Playwright, on le remplace et on émet l'événement, comme pour la vérification de la
mise à jour automatique. 28 contrôles, dont : la fiche ne se recharge pas quand on marche,
marcher 150 m ne relance la liste qu'une fois, le suivi rattrape 400 m au retour au premier
plan, zéro erreur console. Deux détails à connaître pour écrire ces contrôles : **suivi
actif, le marqueur ne bouge pas à l'écran** puisque c'est la carte qui glisse sous lui —
comparer des pixels ne prouve rien, il faut comparer au `map.project()` de la position
attendue (ou `unproject()` du marqueur), ou couper le suivi d'abord ; et `aria-pressed` du
bouton « Me localiser » dit si le suivi est actif, c'est la sonde la plus simple.

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
- **Toujours passer `select`**, y compris sur une fiche unique : sans lui, `/records`
  renvoie les **114 champs** de l'enregistrement (3 457 octets mesurés) là où la fiche en
  affiche 31 (1 063 octets). Les deux tiers du transfert partaient en bassins, tribunes,
  homologations et découpages administratifs que rien ne lit. Corollaire : une donnée
  nouvellement affichée doit être ajoutée à `DETAIL_FIELDS`, sinon elle arrive vide.
- L'échappement de `quote()` est **sûr et vérifié contre l'API réelle** : une valeur forgée
  `a\" OR equip_numero LIKE "b` ressort en `ODSQLSyntaxError`, pas en clause élargie.
  C'est le seul point d'entrée d'une chaîne extérieure (l'identifiant d'un lien partagé) :
  ne jamais le remplacer par une interpolation directe.
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

La couverture vient donc d'**OpenStreetMap** (`leisure=playground`) : **~46 000** objets en
France, dont deux tiers en polygones — `nwr` + `out center` les ramène tous à un point.

**Ces données ne sont plus interrogées à l'exécution.** Overpass a été essayé et abandonné :
mesuré en série sur une même vue, il échouait **trois fois sur huit** (504 de passerelle,
429 de quota, pages « too busy » servies en 200), et signalé depuis un téléphone la
catégorie ne fonctionnait tout simplement jamais. Ne pas y revenir.

L'aléa est déplacé à la génération : `scripts/build-playgrounds.mjs` (`npm run playgrounds`)
interroge Overpass cellule par cellule, avec cinq reprises espacées, et écrit
`public/data/playgrounds/`. À relancer de temps en temps — les aires de jeux bougent peu, et
la date de relevé est inscrite dans `index.json` puis affichée dans la fiche.

Ce qu'il faut savoir avant d'y toucher :

- **Découpage en cellules d'un degré** (`44_4` = coin sud-ouest). Une vue au zoom minimum en
  recouvre trois ou quatre. Une aire n'est écrite que dans la cellule qui la **contient** :
  les emprises se touchent et Overpass renvoie les objets à cheval des deux côtés, sans ce
  test on les compterait deux fois.
- `index.json` liste les cellules **non vides** : celles qui manquent (mer, forêt) ne
  déclenchent aucune requête. Les fichiers sont en cache `StaleWhileRevalidate` — servis
  immédiatement, rafraîchis derrière — car leur nom ne porte pas d'empreinte.
- **Les tris d'accès sont faits à la génération** : `access` valant
  `private|customers|no|permit|members|residents` (`customers` élimine les aires de
  McDonald's), plus `indoor=yes` et `fee=yes`. L'absence d'étiquette vaut autorisation,
  c'est le cas majoritaire. Changer ce filtre impose de régénérer.
- **`lit` et `wheelchair` restent filtrés à l'affichage**, et c'est une autre raison : une
  aire sans étiquette `lit` n'est pas une aire non éclairée, elle est non renseignée. Les
  figer à la génération ferait passer une lacune de saisie pour une réponse.
- **La leçon Overpass, si on devait y retoucher** : une expression `!~` dans la requête
  interdit l'usage de l'index de tags et fait balayer toute l'emprise. Sur 346 km², la même
  requête passait de **19,1 s à 1,4 s** une fois les `!~` retirés. Le script n'en met aucune.
- **Overpass répond 406 à `User-Agent: node`**, celui que Node met par défaut. Le script
  s'identifie explicitement ; un relais Playwright doit réexpédier les en-têtes du
  navigateur. Attention aussi : `route.fulfill()` fabrique la réponse **dans** le
  navigateur, donc n'exerce jamais le CORS ni la couche réseau — c'est ce qui m'a fait
  manquer une panne réelle. Et le navigateur du conteneur n'a pas de réseau sortant
  (`ERR_CONNECTION_RESET`, même avec `--proxy-server`).
- **Les miroirs sont inutilisables**, retestés avec la requête rapide : `private.coffee`
  28 s et des données vieilles de deux mois, `kumi.systems` 504 après 64 s, `osm.ch` et
  `osm.jp` sont des extraits régionaux (0 objet en France).
- Nom et type sont volontairement **identiques** (`Aire de jeux`) quand OSM n'a pas de nom,
  ce qui est le cas trois fois sur quatre : `sameLabel()` (`src/lib/text.ts`) évite alors
  d'écrire deux fois la même ligne dans la liste et dans le bandeau de la fiche.
- La fiche **ne déclenche aucun chargement** : la cellule porte déjà toutes les étiquettes.
  Un lien partagé non plus — `share()` écrit toujours `lat`/`lng` à côté de `e`, la position
  dit quelle cellule ouvrir.
- L'emoji 🛝 est **Unicode 15** (2022) : iOS 16.4+, Android 14+. C'est le plus récent de la
  taxonomie, qui exigeait jusque-là Unicode 11. Sur un appareil plus ancien, il tombera en
  tofu — accepté, aucun autre emoji ne dit « aire de jeux ».

L'attribution ODbL est posée dans le contrôle d'attribution de MapLibre **en permanence**,
pas seulement quand la catégorie est cochée : plus simple, et jamais faux.

## « Voir la rue » : pourquoi un lien et pas une image

Le RES décrit beaucoup et ne montre rien. La fiche porte donc un lien sortant vers Google
Street View (`streetViewUrl`, `geo.ts`) — pas d'aperçu intégré. Ce n'est pas un lot de
consolation, c'est le résultat d'une mesure. Instruit en août 2026, à ne pas refaire sans
rejouer `npm run mesure-panoramax`.

**Une image intégrée est exclue par construction.** La Street View Static API demande une
clé et un compte de facturation, et la clé serait publique dans un client statique : c'est
frontalement contraire aux deux choix fondateurs. Un lien sortant, lui, ne coûte rien, ne
demande aucune clé et **n'ajoute aucune ligne de CSP** — rien n'est chargé, on navigue.

**Panoramax est la seule alternative libre, et elle ne suffit pas.** Trois chiffres,
mesurés sur 654 équipements du RES (échantillon régulier, 12 départements de quatre
profils plus le cœur de 12 grandes villes) :

- **36 %** de couverture en France, tous profils confondus ;
- **14 %** en zone rurale (Gers 7 %, Creuse 13 %) — un aperçu absent quatre fois sur cinq ;
- **79 %** dans le cœur des grandes villes, mais très inégal : Strasbourg 100 %, Lyon et
  Lille 96 %, Rennes 40 %.

**Et le piège, qui n'est pas dans les chiffres de couverture** : trois photos sur quatre
sont des **360°**, et leur vignette (`thumb`, 24 ko) montre le centre du panorama —
c'est-à-dire la **direction de marche**, la route, pas l'équipement. La documentation de
l'API est explicite : `place_fov_tolerance` est *ignoré pour les photos 360°*, donc pour
elles `place_position` n'est qu'un filtre de distance et ne garantit aucune visibilité. Un
`<img src={thumb}>` naïf afficherait une rue au hasard : le « pire que pas d'aperçu », en
plus sournois puisque ça *ressemble* à un aperçu.

Redresser la vue impose de télécharger le panorama complet (`sd.jpg`, équirectangulaire
2048×1024, **264 ko**) et de le recadrer au canvas vers le cap photo→équipement. La
convention est vérifiée : **le centre de l'image équirectangulaire regarde `view:azimuth`**
(un recadrage central reproduit la vignette au pixel près), l'axe x parcourt 360° dans le
sens horaire. Les tuiles (`…/tiles/{col}_{row}.jpg`) sont un plus mauvais marché : 175 ko
pièce et il en faut quatre pour couvrir l'horizon.

Reste la question de fond, et c'est elle qui tranche : **même recadrée correctement, une
image sur deux ne montre pas l'équipement**. La photo est prise de la route, le point du
RES est au milieu du terrain, et entre les deux il y a une haie, un grillage ou un
bâtiment. Noté à l'œil sur deux planches de contact : dans la configuration la plus
favorable (photo la plus proche à ≤ 25 m, qui ne couvre que 29 % des équipements en cœur
de ville), 6 cas utiles sur 12. Soit ~15 % des équipements urbains servis, à 264 ko pièce.
La variante économique (photos plates seules, dont la vignette est bien cadrée et
directement affichable) tombe à 11 % de couverture.

Un visualiseur, lui, permet de **tourner la tête** — exactement ce qu'une vignette figée
ne peut pas faire, et exactement ce qui manque quand la photo est prise à 20 m de côté.
C'est pourquoi le lien résout le besoin réel là où l'image intégrée le dégraderait.

Deux détails à conserver : le lien vit dans le corps de la fiche au contact de l'adresse,
pas dans le pied de page — c'est une vérification qu'on fait *en lisant*, pas l'action de
départ ; et son libellé nomme Google, comme les autres liens sortants nomment leur
destination.

Note utile si la question revient : **`api.panoramax.xyz` est l'instance fédérée**, elle
sert aussi les photos de `panoramax.ign.fr`. Sur 360 points, aucun n'était couvert par
l'IGN sans l'être par elle — inutile d'interroger les deux.

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
  écran) — et c'est seulement dans ce cas qu'elle arrête le suivi de la position.
- La position est **suivie en continu** (`watchPosition`), au seuil de 8 m ; la carte ne la
  suit que si `followUser` est vrai, et le premier geste sur la carte le fait retomber. Un
  recentrage programmé, lui, n'arrête jamais le suivi (voir « La position suit le
  mouvement »).
- La position d'aperçu de la feuille n'est **pas** une constante : elle vaut la hauteur
  réelle de l'en-tête, mesurée au `ResizeObserver`. Une valeur en dur laissait dépasser un
  bout de carte tronqué dès que le titre passait sur deux lignes.
- État partagé dans l'URL : `lat`, `lng`, `z`, `s` (sports), `f` (drapeaux), `e`
  (équipement). Filtres mémorisés sous `sportsderue.filters.v1`.

## Ce qui doit garder son identité entre deux rendus

Tout part de la même mécanique : **la vue change à chaque fin de déplacement**, et tout ce
qui en descend est refabriqué. Trois verrous posés en août 2026, à ne pas défaire — chacun
répare une dépense qui ne se voyait pas à la lecture du code.

1. **`origin` (App).** C'est le point d'où partent les distances. Seule sa *valeur* compte,
   jamais son identité : c'est elle qui déclenche le recalcul des distances et le tri de
   toute la liste. Il était refabriqué à chaque `moveend` alors qu'il vaut la position GPS
   — donc la même chose — tant qu'on se promène à moins de 30 km. D'où le verrou
   (`lastOrigin`), qui compare les **valeurs** et non les objets. Depuis que la position est
   suivie en continu, il tolère 25 m au lieu d'exiger l'égalité : une mesure arrive dès
   qu'on a fait huit pas, et le marqueur doit les suivre — pas la liste.
2. **`mapItems` contre `items` (`useEquipments`).** La carte n'a besoin ni du tri ni des
   distances, et réinstaller sa source GeoJSON coûte un **reclustering complet**. Elle
   reçoit donc `mapItems`, dont l'identité ne change que quand les données changent
   vraiment. La liste, elle, reçoit `items` — triés, distancés.
3. **`EquipmentRow` mémoïsée + `onSelect` stable.** La feuille affiche jusqu'à 1 500 lignes
   et se redessine pour des raisons qui ne les concernent pas (hauteur du panneau, barre de
   chargement, sélection). `onSelect` (App) lit donc ce dont il a besoin dans des refs au
   lieu de le capturer en dépendance : sans identité stable, la mémoïsation ne sert à rien.

Le symptôme le plus visible de cette famille, corrigé au passage : **la fiche d'équipement
se rechargeait à chaque mouvement de carte**. Son effet se calait sur l'objet `equipment`,
refabriqué par le recalcul des distances — or ouvrir une fiche recentre la carte. Mesuré
sur un parcours Playwright, une seule tape sur un équipement hors écran déclenchait
**4 appels réseau au lieu de 1**, et rejouait « Chargement de la fiche… » sur une fiche déjà
affichée. L'effet ne suit désormais que `equipment.id` et `equipment.source`.

Les épingles, enfin, sont mises en cache (`pinCache`) : `setStyle()` vide les images de la
carte, et les dix-huit gouttes étaient redessinées au canvas au passage du style provisoire
au style thématisé — au pire moment.

## L'hébergement, et ce que personne ne fait à notre place

Le site est parti sur un mutualisé **o2switch** (cPanel, Apache/LiteSpeed) en août 2026,
sur `sportsderue.fr`. La migration elle-même était sans difficulté — un site statique se
recopie. Le danger était ailleurs : **ce qu'un hébergeur fait ou ne fait pas sans qu'on le
lui demande**, et qui ne se signale jamais quand ça manque.

Ce que o2switch fournit seul, et qu'il ne faut donc pas redéclarer : **HTTPS et son
certificat** (AutoSSL) et **la compression** (LiteSpeed). Attention, ce n'est pas une
garantie contractuelle : les 936 ko de MapLibre partiraient bruts au lieu de ~243 ko sans
que personne ne le remarque depuis une fibre, d'où le `mod_deflate` déclaré quand même et
le contrôle dans l'arbitre.

Ce qu'il ne fournit pas et qu'il a fallu écrire : **la redirection vers HTTPS**, **HSTS**
— et il compte plus qu'avant, `.fr` n'étant pas un domaine de premier niveau préchargé —
**le domaine canonique** (`www.` répond d'office, cPanel le crée avec le domaine), les
en-têtes de sécurité, les types MIME, le repli page unique et les règles de cache.

Et surtout, la règle dont tout dépend : `sw.js`, `index.html` et `manifest.webmanifest`
**toujours revalidés**. Un `max-age` sur l'un des trois et l'application installée reste
figée sur son ancienne version — c'est le symptôme signalé depuis un téléphone, celui qui
obligeait à vider le cache à la main. Rien ne le signale, l'application marche.

Quatre choses sont donc en place, à tenir à jour ensemble :

- `deploy/o2switch/.htaccess` — **le fichier de référence, celui qui est réellement
  servi**. Deux différences de mécanique à connaître par rapport à nginx : Apache
  **cumule** les en-têtes des portées imbriquées au lieu de les remplacer (donc pas de
  fichier à réinclure), et `<FilesMatch>` ne sait pas viser un répertoire — `/assets/`
  passe par un `SetEnvIf` sur l'URL demandée.
- `deploy/Caddyfile` — variante pour un serveur qu'on administre : Caddy gère certificat,
  compression et types MIME tout seul, et n'a pas le piège d'héritage de nginx.
- `deploy/nginx/` — deux fichiers, et ce n'est pas de la coquetterie : **dès qu'un bloc
  `location` déclare un `add_header`, il perd tous ceux hérités du parent**. Comme chaque
  `location` pose son propre `Cache-Control`, les en-têtes de sécurité s'évaporeraient de
  tout ce qui n'est pas l'accueil. D'où le fichier inclus dans *chaque* `location`.
- `scripts/verifie-deploiement.mjs` — **l'arbitre**. Il ne connaît pas l'hébergeur,
  seulement le contrat, et se lance contre n'importe quelle URL :
  `npm run verifie-deploiement -- https://sportsderue.fr`. C'est lui qui empêche les trois
  configurations de diverger : plutôt que de les comparer entre elles, on vérifie ce que
  le site sert réellement. Le workflow de déploiement le lance tout seul à la fin de
  chaque mise en ligne, donc une régression de configuration fait échouer la CI.

Ni nginx, ni Caddy, ni Apache n'ont pu être exécutés dans le conteneur (pas de démon
Docker) : les configurations sont écrites, pas éprouvées. Le *contrat*, lui, l'est — un serveur local
appliquant les mêmes règles passe le contrôle, et le parcours complet de l'application y
tourne sans erreur. La première mise en ligne doit donc commencer par le script.

## Les en-têtes de sécurité et la CSP

Tout tient dans le bloc `mod_headers` de `deploy/o2switch/.htaccess`, posé en août 2026 :
politique de sécurité du contenu (CSP), `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, et HSTS — personne
ne le pose à notre place.

Deux points qui méritent d'être compris avant d'y toucher :

- **`Referrer-Policy` compte ici plus qu'ailleurs.** Les URL de l'application portent
  `lat`, `lng` et l'équipement consulté, et l'application ouvre des liens vers Google Maps,
  Apple Maps et OpenStreetMap. `strict-origin-when-cross-origin` fait qu'ils n'emportent
  que l'origine — sinon c'est la position de la personne qui part chez un tiers.
- **`connect-src` énumère les deux services** encore appelés depuis le navigateur
  (`data.geopf.fr`, `equipements.sports.gouv.fr`). Les aires de jeux n'y sont plus depuis
  qu'elles sont livrées avec l'application : servies depuis le site, elles relèvent de
  `'self'`. Toute nouvelle source de données doit y être ajoutée, sinon ses appels sont
  refusés — et c'est bien le but. `style-src` garde
  `'unsafe-inline'` (la charte pose beaucoup de couleurs de sport en ligne, et une feuille
  injectée ne vaut pas un script) ; `worker-src` accepte `blob:` au cas où MapLibre
  basculerait sur un worker en blob.

La CSP a d'abord vécu en `<meta>` dans `index.html`, faute de pouvoir tester un en-tête à
l'époque. **Elle est en en-tête depuis août 2026**, et doit y rester : elle vaut alors
avant l'analyse du document, sur toutes les réponses et pas seulement sur le HTML, et
`frame-ancestors` y fonctionne — ce qui n'est pas le cas en `<meta>`, où il est ignoré.

Vérifié au navigateur sur le build de production, en servant `dist` derrière un serveur
local qui applique les **mêmes en-têtes que la configuration livrée** (le test porte donc
sur ce qui est servi) :
parcours complet, plus les deux chemins qu'il ne touche pas et que la CSP pouvait couper —
le chargement des aires de jeux (catégorie « Jeux ») et l'ouverture par lien partagé
(`?e=…`). Zéro violation, zéro erreur de console. La mise en cadre depuis une autre
origine est bien refusée : le cadre demande le document mais n'exécute aucun script, là où
un chargement direct en charge quatre.

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
- **Aucune photo intégrée dans la fiche**, seulement un lien « Voir la rue ». Mesuré, pas
  supposé — voir « « Voir la rue » : pourquoi un lien et pas une image ».
- Pas de contrôle de zoom MapLibre (la colonne de droite est prise par les boutons
  flottants), attribution en bas à gauche décalée au-dessus de la feuille via `--sheet-h`.
- Pas d'ESLint, pas de tests unitaires : la vérification passe par le parcours Playwright
  ci-dessus.

## Pistes connues

Rien n'est engagé, mais les questions ont déjà été instruites :

- Montée en charge : PMTiles nocturnes (voir plus haut). Un cache en périphérie
  (Cloudflare Worker, normalisation de l'emprise sur une grille) n'est utile que s'il faut
  de la fraîcheur à la journée. Demander un relèvement de quota est gratuit et sans risque.
- Manques fonctionnels : horaires d'ouverture (absents du RES), signalement d'une erreur de
  fiche, itinéraire piéton calculé (aujourd'hui c'est un lien vers l'application de
  cartographie du téléphone, et la distance est à vol d'oiseau).
- Aperçu photo intégré : instruit et écarté sur mesure, pas fermé pour autant. Panoramax
  progresse vite (plus de la moitié des photos trouvées datent de 2024-2026) ; rejouer
  `npm run mesure-panoramax` dans un an. Le seuil à partir duquel ça vaudrait le coup :
  une couverture urbaine qui tienne à ≤ 25 m, là où l'image montre vraiment l'équipement.
- Vérification de build lisible côté GitHub : un workflow qui ne fait que `npm run build`,
  pour avoir un témoin vert sur chaque commit sans rien déployer. Proposé, non retenu pour
  l'instant (le dépôt n'a aujourd'hui aucun workflow).
