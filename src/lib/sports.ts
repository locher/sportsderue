/**
 * Taxonomie des sports.
 *
 * La base Data ES (Recensement des Équipements Sportifs) décrit chaque équipement par
 * un `equip_type_name` (une centaine de valeurs) et par la liste des activités
 * praticables `aps_name` (champ multivalué, ~250 valeurs). On regroupe ces valeurs en
 * catégories parlantes pour un usage grand public, et on s'en sert pour construire les
 * clauses ODSQL envoyées à l'API.
 *
 * Les deux champs ne disent pas la même chose, et c'est tout l'intérêt de les croiser :
 *
 * - `equip_type_name` dit ce que l'équipement **est** (« Terrain de basket-ball ») ;
 * - `aps_name` dit ce qu'on **peut y pratiquer** (« Basket-Ball »).
 *
 * Un city-stade est un seul équipement (`Multisports/City-stades`) qui déclare souvent
 * basket, foot, hand et volley. Ne filtrer que sur le type revenait à le rendre
 * introuvable derrière le filtre « Basket », alors qu'on y joue au basket : à l'échelle
 * de la France, le filtre basket passe de 4 100 à 17 700 équipements une fois les
 * activités prises en compte, et le filtre handball de 750 à 12 400.
 *
 * Deux conséquences volontaires :
 *
 * 1. Le croisement n'agit que sur la **recherche**. L'affichage reste piloté par le type
 *    (`categoryOf`) : un city-stade retrouvé via « Basket » garde son épingle de
 *    city-stade, il n'est pas dupliqué en une épingle par activité.
 * 2. Une activité est un signal plus faible qu'un type — un gymnase peut déclarer dix
 *    activités et remonter sous dix filtres. Les correspondances par activité sont donc
 *    restreintes au plein air (voir `dataes.ts`) : hors salle pour les catégories
 *    urbaines, sites naturels compris pour les catégories nature.
 */

export type CategoryId =
  | 'citystade'
  | 'basket'
  | 'foot'
  | 'pingpong'
  | 'tennis'
  | 'skate'
  | 'fitness'
  | 'petanque'
  | 'volley'
  | 'handball'
  | 'rugby'
  | 'athletisme'
  | 'pelote'
  | 'velo'
  | 'jeux'
  | 'rando'
  | 'escalade'
  | 'eau'

export type CategoryGroup = 'urbain' | 'nature'

/**
 * Base d'où proviennent les points d'une catégorie.
 *
 * `res` — le Recensement des équipements sportifs (Data ES), qui porte tout le reste
 * de l'application. `osm` — OpenStreetMap via Overpass : les aires de jeux pour
 * enfants n'existent dans **aucun** référentiel national (le RES ne recense que du
 * sport, et data.gouv.fr n'a que des jeux de données communaux épars).
 */
export type DataSource = 'res' | 'osm'

export interface SportCategory {
  id: CategoryId
  label: string
  /** Libellé court pour les puces de filtre. */
  short: string
  emoji: string
  /** Couleur d'identité : épingles, halos, pastilles. */
  color: string
  /** Variante lumineuse, pour les dégradés et les lueurs. */
  vivid: string
  /** Variante sombre : contraste ≥ 4,5:1 avec du texte blanc. */
  deep: string
  group: CategoryGroup
  /** Base interrogée pour cette catégorie. */
  source: DataSource
  /** Valeurs exactes de `equip_type_name` : ce que l'équipement est. */
  types: string[]
  /**
   * Valeurs exactes de `aps_name` : ce qu'on peut y pratiquer. C'est ce qui fait
   * remonter un city-stade sous « Basket ». Restreint au plein air à la requête.
   */
  sports: string[]
  /** Coché par défaut au premier lancement. */
  defaultOn: boolean
}

export const CATEGORIES: SportCategory[] = [
  {
    id: 'citystade',
    label: 'City-stade / Multisports',
    short: 'City-stade',
    emoji: '🥅',
    color: '#0f7b5f',
    vivid: '#0A9974',
    deep: '#0F7B5F',
    group: 'urbain',
    source: 'res',
    types: ['Multisports/City-stades', 'Terrain mixte'],
    sports: ['Multisports/sport pour tous'],
    defaultOn: true,
  },
  {
    id: 'basket',
    label: 'Basket-ball',
    short: 'Basket',
    emoji: '🏀',
    color: '#e2681a',
    vivid: '#F3792B',
    deep: '#BD5411',
    group: 'urbain',
    source: 'res',
    types: [
      'Terrain de basket-ball',
      'Terrain de basket-ball 3x3',
      'But/Panier isolé de sport collectif',
    ],
    sports: ['Basket-Ball'],
    defaultOn: true,
  },
  {
    id: 'foot',
    label: 'Football',
    short: 'Foot',
    emoji: '⚽',
    color: '#1f7a3d',
    vivid: '#1E9646',
    deep: '#1F7A3D',
    group: 'urbain',
    source: 'res',
    types: [
      'Terrain de football',
      'Terrain de foot 5x5',
      'Terrain de soccer',
      'Terrain de futsal extérieur',
    ],
    sports: ['Football / Football en salle (Futsal)', 'Beach soccer'],
    defaultOn: true,
  },
  {
    id: 'pingpong',
    label: 'Tennis de table',
    short: 'Ping-pong',
    emoji: '🏓',
    color: '#c2185b',
    vivid: '#EF1269',
    deep: '#C2185B',
    group: 'urbain',
    source: 'res',
    // Les tables extérieures n'ont pas de `equip_type_name` dédié (elles sont classées en
    // « Autres équipements divers » ou rattachées à un city-stade) : cette catégorie
    // repose entièrement sur l'activité praticable.
    types: [],
    sports: ['Tennis de table'],
    defaultOn: true,
  },
  {
    id: 'tennis',
    label: 'Tennis / Padel',
    short: 'Tennis',
    emoji: '🎾',
    color: '#8a9b0f',
    vivid: '#AAC108',
    deep: '#6B7809',
    group: 'urbain',
    source: 'res',
    types: ['Court de tennis', 'Mur de tennis', 'Piste de padel'],
    sports: ['Tennis', 'Padel', 'Pickleball'],
    defaultOn: true,
  },
  {
    id: 'skate',
    label: 'Skate / BMX / Roller',
    short: 'Skate',
    emoji: '🛹',
    color: '#6d28d9',
    vivid: '#7B37E7',
    deep: '#6D28D9',
    group: 'urbain',
    source: 'res',
    types: [
      'Skatepark',
      'Piste de bicross',
      'Pumptrack',
      'Espace de vélo-freestyle',
      'Anneau de Roller',
      'Espace trial',
      'Stade VTT de proximité',
      'Terrain de trial',
    ],
    // L'activité « Vtt (Cross Country/…) » est volontairement absente : 9 300 des 12 300
    // équipements qui la déclarent sont des boucles de randonnée, qui inonderaient la
    // vue urbaine. Elles restent accessibles via la catégorie Randonnée.
    sports: [
      'Planche à roulettes (Skate)',
      'Roller acrobatique',
      'Rodéo/Freestyle',
      'Bicross (BMX)',
      'Trial',
      'Patinage artistique et danse sur roulettes',
      'Patinage de course',
      'Randonnée Roller',
      'Hockey sur patins en ligne / Hockey sur patins',
    ],
    defaultOn: true,
  },
  {
    id: 'fitness',
    label: 'Fitness / Street workout',
    short: 'Fitness',
    emoji: '💪',
    color: '#0d6efd',
    vivid: '#1F79FF',
    deep: '#0B62E8',
    group: 'urbain',
    source: 'res',
    types: ['Aire de fitness/street workout', 'Parcours sportif/santé', "Parcours d'initiation"],
    sports: ['Activités de forme et de santé', 'Musculation'],
    defaultOn: true,
  },
  {
    id: 'petanque',
    label: 'Pétanque / Boules',
    short: 'Pétanque',
    emoji: '🎱',
    // Ocre de terrain sablé : plus lisible qu'un taupe sur le fond de carte.
    color: '#a87c32',
    vivid: '#C79433',
    deep: '#8A6520',
    group: 'urbain',
    source: 'res',
    types: [
      'Terrain de pétanque',
      'Terrain de boules',
      'Terrain de boules traditionnelles',
      'Terrain de quilles',
    ],
    sports: [
      'Pétanque et jeu provencal',
      'Sports boules',
      'Boules traditionnelles',
      'Sports de quilles',
    ],
    defaultOn: true,
  },
  {
    id: 'volley',
    label: 'Volley / Beach-volley',
    short: 'Volley',
    emoji: '🏐',
    color: '#d4a017',
    vivid: '#F3BA22',
    deep: '#926D0C',
    group: 'urbain',
    source: 'res',
    types: ['Terrain de volley-ball', 'Terrain de beach-volley'],
    sports: ['Volley-ball / Volley-ball de plage (beach-volley) / Green-Volley'],
    defaultOn: true,
  },
  {
    id: 'handball',
    label: 'Handball',
    short: 'Hand',
    emoji: '🤾',
    color: '#0e7490',
    vivid: '#078EB3',
    deep: '#0E7490',
    group: 'urbain',
    source: 'res',
    types: ['Terrain de handball'],
    sports: ['Handball / Mini hand / Handball de plage'],
    defaultOn: true,
  },
  {
    id: 'rugby',
    label: 'Rugby',
    short: 'Rugby',
    emoji: '🏉',
    color: '#8c2f39',
    vivid: '#AC313E',
    deep: '#8C2F39',
    group: 'urbain',
    source: 'res',
    types: ['Terrain de rugby'],
    sports: ['Rugby à 15 / Rugby à 7', 'Rugby à 13 / Rugby à 7'],
    defaultOn: true,
  },
  {
    id: 'athletisme',
    label: 'Athlétisme',
    short: 'Athlé',
    emoji: '🏃',
    color: '#b4530a',
    vivid: '#E06000',
    deep: '#B4530A',
    group: 'urbain',
    source: 'res',
    types: [
      "Piste d'athlétisme isolée",
      "Piste d'athlétisme 2 à 4 couloirs",
      'Stade d’athlétisme',
      'Aire de saut',
      'Aire de lancer',
      'Piste de course sur le plat',
    ],
    sports: [
      'Course sur piste',
      'Course sur le plat',
      'Cross country',
      'Course et marche sur route (hors stade)',
      'Saut',
      'Lancer',
    ],
    defaultOn: true,
  },
  {
    id: 'pelote',
    label: 'Pelote / Fronton',
    short: 'Fronton',
    emoji: '🧱',
    color: '#a8324a',
    vivid: '#CD3453',
    deep: '#A8324A',
    group: 'urbain',
    source: 'res',
    types: [
      'Fronton place libre',
      'Mur ou fronton mixte',
      'Mur à gauche',
      'Terrain de ballon au poing/long paume',
      'Terrain de balle au tambourin',
    ],
    // Le libellé de la pelote basque contient une virgule que le RES a coupée : la valeur
    // existe dans la base sous forme de deux entrées distinctes, il faut les deux.
    sports: [
      'Cesta punta/Mains nues/Pala/Chistera (grande',
      'joko garbi)/Paleta/Xare/Frontenis/Pala corta/Rebot',
      'Ballon au poing',
      'Balle au tambourin',
      'Longue paume',
      'Courte paume',
      'Jeu de Paume',
    ],
    defaultOn: true,
  },
  {
    id: 'velo',
    label: 'Vélo / Piste cyclable',
    short: 'Vélo',
    emoji: '🚴',
    color: '#0891b2',
    vivid: '#00B1DB',
    deep: '#037F9D',
    group: 'urbain',
    source: 'res',
    types: ['Anneau / piste de cyclisme', 'Terrain de cyclocross', 'Piste de descente'],
    sports: [
      'Cyclotourisme',
      'Cyclisme sur piste',
      'Cyclisme sur route/Vélo Couché',
      'Cyclocross',
    ],
    defaultOn: true,
  },
  {
    id: 'jeux',
    label: 'Jeux pour enfants',
    short: 'Jeux',
    emoji: '🛝',
    // Fuchsia : la seule plage de teintes encore libre entre le violet du skate et le
    // rose du ping-pong. Ce n'est pas un sport, ça ne doit pas se confondre avec un.
    color: '#a21caf',
    vivid: '#C42AD3',
    deep: '#8F1A9A',
    group: 'urbain',
    // Seule catégorie qui ne vient pas du RES : les aires de jeux ne sont recensées
    // nulle part au niveau national, c'est OpenStreetMap qui les porte (~45 900 en
    // France). `types` et `sports` restent vides — aucune clause n'est envoyée à Data ES.
    source: 'osm',
    types: [],
    sports: [],
    // Décochée par défaut : chaque vue coûte un appel à Overpass, un service bénévole
    // bien plus fragile qu'Opendatasoft. Les familles la cochent en une tape, les
    // autres visiteurs ne le paient pas.
    defaultOn: false,
  },
  {
    id: 'rando',
    label: 'Randonnée / Course d’orientation',
    short: 'Rando',
    emoji: '🥾',
    color: '#4d7c0f',
    vivid: '#5C9A0A',
    deep: '#4D7C0F',
    group: 'nature',
    source: 'res',
    types: ['Boucle de randonnée', 'Parcours fixe de course d’orientation', 'Relais rando-vélo'],
    sports: [
      'Randonnée pédestre',
      'Marche',
      'Marche Nordique',
      "Course d'orientation - Pédestre",
      "Course d'orientation - Vtt",
      'Raquette à neige',
    ],
    defaultOn: false,
  },
  {
    id: 'escalade',
    label: 'Escalade',
    short: 'Escalade',
    emoji: '🧗',
    color: '#78350f',
    vivid: '#953C0A',
    deep: '#78350F',
    group: 'nature',
    source: 'res',
    types: [
      "Site d'escalade en falaise",
      "Site de blocs d'escalade",
      "Structure Artificielle d'Escalade",
      'Via ferrata / Via corda',
    ],
    sports: ['Escalade', 'Escalade sur Via ferrata/Corda', 'Escalade sur PAH'],
    defaultOn: false,
  },
  {
    id: 'eau',
    label: 'Baignade / Nautisme',
    short: 'Baignade',
    emoji: '🏊',
    color: '#0369a1',
    vivid: '#007DC2',
    deep: '#0369A1',
    group: 'nature',
    source: 'res',
    types: [
      'Baignade aménagée',
      "Site d'activités aquatiques et nautiques",
      'Stade d’eau vive',
      "Point d'embarquement et de débarquement isolé",
    ],
    sports: [
      'Baignade loisirs',
      'Natation en eau libre',
      'Canoë de randonnée',
      'Kayak de mer',
      'Nage en eau vive',
      'Raft (embarcation gonflable)',
      'Canyonisme',
      'Surf',
      'Wave-ski',
      'Planche à Voile',
      // Le RES contient les deux orthographes.
      'Stand up Paddle',
      'Stand up Padle',
      'Aviron',
      "Pirogue polynésienne (Va'a)/Pirogue dragon",
    ],
    defaultOn: false,
  },
]

export const CATEGORY_BY_ID: Record<CategoryId, SportCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, SportCategory>

export const ALL_CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id)

export const DEFAULT_CATEGORY_IDS: CategoryId[] = CATEGORIES.filter((c) => c.defaultOn).map(
  (c) => c.id,
)

/**
 * Répartit les catégories cochées par base à interroger. Les deux sources sont
 * appelées séparément : une base lente ou en panne ne doit pas retenir l'autre.
 */
export function categoriesBySource(ids: readonly CategoryId[]): Record<DataSource, CategoryId[]> {
  const split: Record<DataSource, CategoryId[]> = { res: [], osm: [] }
  for (const id of ids) {
    const category = CATEGORY_BY_ID[id]
    if (category) split[category.source].push(id)
  }
  return split
}

/** `equip_type_name` → catégorie, pour choisir l'icône d'un point. */
const TYPE_TO_CATEGORY = new Map<string, CategoryId>()
for (const c of CATEGORIES) {
  for (const t of c.types) if (!TYPE_TO_CATEGORY.has(t)) TYPE_TO_CATEGORY.set(t, c.id)
}

/** `aps_name` → catégorie, utilisé en repli quand le type d'équipement est générique. */
const SPORT_TO_CATEGORY = new Map<string, CategoryId>()
for (const c of CATEGORIES) {
  for (const s of c.sports) if (!SPORT_TO_CATEGORY.has(s)) SPORT_TO_CATEGORY.set(s, c.id)
}

/** Activités d'une catégorie, en Set, pour tester l'appartenance sans balayer la liste. */
const SPORTS_OF_CATEGORY = new Map<CategoryId, ReadonlySet<string>>(
  CATEGORIES.map((c) => [c.id, new Set(c.sports)]),
)

export const FALLBACK_CATEGORY: CategoryId = 'citystade'

/**
 * Catégories filtrées auxquelles un équipement répond par ses **activités**, sans être
 * de ce type-là — typiquement un city-stade retrouvé sous le filtre « Basket ».
 *
 * Sert uniquement à l'affichage : la carte garde une épingle unique, à la catégorie de
 * l'équipement, et la liste ajoute une mention expliquant pourquoi il est là.
 */
export function practicableMatches(
  equipment: { category: CategoryId; sports: string[] },
  active: readonly CategoryId[],
): SportCategory[] {
  if (!equipment.sports.length) return []
  const matches: SportCategory[] = []
  for (const id of active) {
    if (id === equipment.category) continue
    const sports = SPORTS_OF_CATEGORY.get(id)
    if (sports && equipment.sports.some((s) => sports.has(s))) matches.push(CATEGORY_BY_ID[id])
  }
  return matches
}

/** Devine la catégorie d'affichage d'un équipement. */
export function categoryOf(type: string | null, sports: string[] = []): CategoryId {
  if (type) {
    const byType = TYPE_TO_CATEGORY.get(type)
    if (byType) return byType
  }
  for (const s of sports) {
    const bySport = SPORT_TO_CATEGORY.get(s)
    if (bySport) return bySport
  }
  return FALLBACK_CATEGORY
}

export function isCategoryId(value: string): value is CategoryId {
  return Object.hasOwn(CATEGORY_BY_ID, value)
}

/** Couleur et emoji d'une catégorie, avec repli. */
export function categoryStyle(id: CategoryId | string): SportCategory {
  return CATEGORY_BY_ID[id as CategoryId] ?? CATEGORY_BY_ID[FALLBACK_CATEGORY]
}

const INK = '#141a17'
const WHITE = '#ffffff'

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/**
 * Texte lisible sur un aplat de couleur : encre sur les tons clairs, blanc sur les
 * tons sombres. Les pastilles de sport peuvent ainsi rester vives — un jaune de
 * volley comme un violet de skate — sans jamais perdre en lisibilité.
 */
export function readableOn(background: string): string {
  const luminance = relativeLuminance(background)
  const withInk = (luminance + 0.05) / (relativeLuminance(INK) + 0.05)
  const withWhite = 1.05 / (luminance + 0.05)
  return withInk >= withWhite ? INK : WHITE
}
