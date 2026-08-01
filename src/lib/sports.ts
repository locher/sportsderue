/**
 * Taxonomie des sports.
 *
 * La base Data ES (Recensement des Équipements Sportifs) décrit chaque équipement par
 * un `equip_type_name` (une centaine de valeurs) et par la liste des activités
 * praticables `aps_name`. On regroupe ces valeurs en catégories parlantes pour un
 * usage grand public, et on s'en sert pour construire les clauses ODSQL envoyées à l'API.
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
  | 'rando'
  | 'escalade'
  | 'eau'

export type CategoryGroup = 'urbain' | 'nature'

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
  /** Valeurs exactes de `equip_type_name`. */
  types: string[]
  /** Valeurs exactes de `aps_name` (champ multivalué). */
  sports?: string[]
  /** Restreint la catégorie aux équipements de plein air (`equip_nature = 'Découvert'`). */
  outdoorOnly?: boolean
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
    types: ['Multisports/City-stades', 'Terrain mixte'],
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
    types: [
      'Terrain de basket-ball',
      'Terrain de basket-ball 3x3',
      'But/Panier isolé de sport collectif',
    ],
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
    types: [
      'Terrain de football',
      'Terrain de foot 5x5',
      'Terrain de soccer',
      'Terrain de futsal extérieur',
    ],
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
    // Les tables extérieures n'ont pas de `equip_type_name` dédié (elles sont classées en
    // « Autres équipements divers » ou rattachées à un city-stade) : on passe par
    // l'activité praticable, restreinte au plein air.
    types: [],
    sports: ['Tennis de table'],
    outdoorOnly: true,
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
    types: ['Court de tennis', 'Mur de tennis', 'Piste de padel'],
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
    types: ['Aire de fitness/street workout', 'Parcours sportif/santé', "Parcours d'initiation"],
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
    types: [
      'Terrain de pétanque',
      'Terrain de boules',
      'Terrain de boules traditionnelles',
      'Terrain de quilles',
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
    types: ['Terrain de volley-ball', 'Terrain de beach-volley'],
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
    types: ['Terrain de handball'],
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
    types: ['Terrain de rugby'],
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
    types: [
      "Piste d'athlétisme isolée",
      "Piste d'athlétisme 2 à 4 couloirs",
      'Stade d’athlétisme',
      'Aire de saut',
      'Aire de lancer',
      'Piste de course sur le plat',
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
    types: [
      'Fronton place libre',
      'Mur ou fronton mixte',
      'Mur à gauche',
      'Terrain de ballon au poing/long paume',
      'Terrain de balle au tambourin',
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
    types: ['Anneau / piste de cyclisme', 'Terrain de cyclocross', 'Piste de descente'],
    defaultOn: true,
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
    types: ['Boucle de randonnée', 'Parcours fixe de course d’orientation', 'Relais rando-vélo'],
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
    types: [
      "Site d'escalade en falaise",
      "Site de blocs d'escalade",
      "Structure Artificielle d'Escalade",
      'Via ferrata / Via corda',
    ],
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
    types: [
      'Baignade aménagée',
      "Site d'activités aquatiques et nautiques",
      'Stade d’eau vive',
      "Point d'embarquement et de débarquement isolé",
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

/** `equip_type_name` → catégorie, pour choisir l'icône d'un point. */
const TYPE_TO_CATEGORY = new Map<string, CategoryId>()
for (const c of CATEGORIES) {
  for (const t of c.types) if (!TYPE_TO_CATEGORY.has(t)) TYPE_TO_CATEGORY.set(t, c.id)
}

/** `aps_name` → catégorie, utilisé en repli quand le type d'équipement est générique. */
const SPORT_TO_CATEGORY = new Map<string, CategoryId>()
for (const c of CATEGORIES) {
  for (const s of c.sports ?? []) if (!SPORT_TO_CATEGORY.has(s)) SPORT_TO_CATEGORY.set(s, c.id)
}

export const FALLBACK_CATEGORY: CategoryId = 'citystade'

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
