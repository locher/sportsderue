/**
 * Aires de jeux pour enfants — servies depuis des fichiers statiques.
 *
 * Le RES ne recense que du sport : ses 185 valeurs de `equip_type_name` ne contiennent
 * aucune aire de jeux, et data.gouv.fr n'a que des jeux de données communaux isolés.
 * OpenStreetMap est la seule couverture nationale (~46 000 objets `leisure=playground`).
 *
 * Cette donnée était d'abord interrogée à l'exécution, via Overpass. Ça ne tenait pas :
 * mesuré en série sur une même vue, le service échouait **trois fois sur huit** (504 de
 * passerelle, 429 de quota, pages « too busy »), et signalé depuis un téléphone, la
 * catégorie ne fonctionnait tout simplement jamais. L'aléa est donc déplacé au moment
 * de la génération — `scripts/build-playgrounds.mjs`, à relancer de temps en temps —
 * et l'application ne lit plus que des fichiers posés à côté d'elle.
 *
 * Ce qu'on y gagne, au-delà de la fiabilité : l'affichage est instantané, il fonctionne
 * hors-ligne, et plus aucun quota ne s'applique. Ce qu'on y perd : la donnée fige entre
 * deux générations. Les aires de jeux bougent peu, et la date est affichée dans la fiche.
 *
 * Découpage en **cellules d'un degré** (`44_4` = coin sud-ouest 44° N, 4° E). Une vue au
 * zoom minimum en recouvre trois ou quatre, quelques kilo-octets chacune, mises en cache
 * par le service worker.
 */
import type { Bbox, EquipmentDetail, Filters } from '../types'

const BASE = `${import.meta.env.BASE_URL}data/playgrounds/`

/** Plafond d'affichage : au-delà, la liste est marquée tronquée. */
export const MAX_PLAYGROUNDS = 900

/**
 * Garde-fou : au zoom minimum de l'application une vue tient dans trois ou quatre
 * cellules. Au-delà, quelque chose ne va pas — on ne charge pas la France entière.
 */
const MAX_CELLS = 12

/** Préfixe des identifiants OpenStreetMap, pour ne jamais les confondre avec le RES. */
const ID_PREFIX = 'osm:'

const KINDS = ['node', 'way', 'relation'] as const

export class PlaygroundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaygroundsError'
  }
}

export function isPlaygroundId(id: string): boolean {
  return id.startsWith(ID_PREFIX)
}

/** Lien vers l'objet sur openstreetmap.org, où la correction se fait directement. */
export function playgroundRecordUrl(id: string): string {
  return `https://www.openstreetmap.org/${id.slice(ID_PREFIX.length)}`
}

/** Équipements de jeu (`playground=*`), traduits pour la liste « Sur place ». */
const FEATURES: Record<string, string> = {
  slide: 'Toboggan',
  swing: 'Balançoire',
  basketswing: 'Balançoire nid d’oiseau',
  seesaw: 'Balançoire à bascule',
  rocker: 'Jeu à bascule',
  springy: 'Jeu à ressort',
  roundabout: 'Tourniquet',
  sandpit: 'Bac à sable',
  climbingframe: 'Structure d’escalade',
  climbingwall: 'Mur d’escalade',
  net: 'Filet à grimper',
  structure: 'Structure de jeu',
  playhouse: 'Maisonnette',
  pirateship: 'Bateau de pirates',
  zipwire: 'Tyrolienne',
  trampoline: 'Trampoline',
  balancebeam: 'Poutre d’équilibre',
  horizontal_bar: 'Barre fixe',
  bridge: 'Pont de singe',
  water: 'Jeux d’eau',
  sledding: 'Piste de luge',
  musical: 'Jeux musicaux',
  activitypanel: 'Panneau d’activités',
  teenshelter: 'Abri pour adolescents',
  exercise: 'Agrès',
  map: 'Carte au sol',
}

/** Revêtements (`surface=*`) rendus dans la langue de la fiche. */
const SURFACES: Record<string, string> = {
  rubber: 'Sol souple',
  rubbercrumb: 'Granulat de caoutchouc',
  tartan: 'Tartan',
  woodchips: 'Copeaux de bois',
  bark_mulch: 'Écorce broyée',
  sand: 'Sable',
  grass: 'Herbe',
  grass_paver: 'Dalles engazonnées',
  gravel: 'Gravier',
  fine_gravel: 'Gravier fin',
  dirt: 'Terre',
  ground: 'Terre',
  asphalt: 'Enrobé',
  concrete: 'Béton',
  paved: 'Revêtu',
  paving_stones: 'Pavés',
  wood: 'Bois',
  synthetic: 'Synthétique',
}

/** `[type, identifiant, latitude, longitude, étiquettes]` — voir le script de génération. */
type Record_ = [number, number, number, number, Record<string, string>?]

interface Manifest {
  /** Date de génération (`AAAA-MM-JJ`), affichée dans la fiche. */
  generatedAt: string
  total: number
  /** Cellules non vides, et leur nombre d'aires. */
  cells: Record<string, number>
}

export interface PlaygroundsResult {
  items: EquipmentDetail[]
  truncated: boolean
}

function str(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function translate(dictionary: Record<string, string>, value: string): string {
  return dictionary[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

function readAgeRange(tags: Record<string, string>): string | null {
  const min = str(tags.min_age)
  const max = str(tags.max_age)
  if (min && max) return `${min} à ${max} ans`
  if (min) return `À partir de ${min} ans`
  if (max) return `Jusqu’à ${max} ans`
  return null
}

/** Convertit un enregistrement compact en fiche complète. */
function toPlayground([kind, id, lat, lon, tags = {}]: Record_): EquipmentDetail {
  const address = [str(tags['addr:housenumber']), str(tags['addr:street'])]
    .filter(Boolean)
    .join(' ')

  return {
    id: `${ID_PREFIX}${KINDS[kind] ?? 'node'}/${id}`,
    source: 'osm',
    // Trois aires sur quatre n'ont pas de nom dans OSM. Nom et type sont alors
    // volontairement identiques : la liste et la fiche savent qu'il ne faut pas
    // écrire deux fois la même ligne (`sameLabel`).
    name: str(tags.name) ?? 'Aire de jeux',
    installation: str(tags.operator),
    type: 'Aire de jeux',
    sports: tags.playground
      ? tags.playground.split(';').map((value) => translate(FEATURES, value))
      : [],
    address: address || null,
    postcode: str(tags['addr:postcode']),
    city: str(tags['addr:city']),
    // Les aires couvertes sont écartées à la génération : ce qui reste est en plein
    // air, ce qui rend le filtre « Plein air uniquement » cohérent avec le RES.
    nature: 'Découvert',
    lit: tags.lit === 'yes',
    accessible: tags.wheelchair === 'yes',
    lon,
    lat,
    category: 'jeux',
    floor: tags.surface ? translate(SURFACES, tags.surface) : null,
    length: null,
    width: null,
    surface: null,
    showers: false,
    toilets: tags.toilets === 'yes',
    changingRooms: false,
    ownerName: str(tags.operator),
    ownerType: null,
    managerType: null,
    serviceDate: str(tags.start_date),
    worksDate: null,
    seasonal: false,
    url: str(tags.website),
    notes: str(tags.description),
    installationNotes: null,
    updatedAt: str(tags.check_date) ?? str(tags['survey:date']),
    department: null,
    region: null,
    ageRange: readAgeRange(tags),
    openingHours: str(tags.opening_hours),
  }
}

/**
 * Le manifeste et les cellules ne sont demandés qu'une fois : la promesse est gardée,
 * pas seulement son résultat, pour que deux vues simultanées ne lancent pas deux
 * requêtes sur le même fichier.
 */
let manifestPromise: Promise<Manifest> | null = null
const cells = new Map<string, Promise<Record_[]>>()

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new PlaygroundsError(`Fichier introuvable (${response.status}).`)
  return (await response.json()) as T
}

function loadManifest(): Promise<Manifest> {
  // Volontairement sans `signal` : le manifeste est partagé par toutes les vues, et un
  // déplacement de carte ne doit pas annuler un chargement dont une autre dépend.
  manifestPromise ??= readJson<Manifest>(`${BASE}index.json`).catch((cause: unknown) => {
    manifestPromise = null
    throw cause
  })
  return manifestPromise
}

function loadCell(key: string): Promise<Record_[]> {
  let pending = cells.get(key)
  if (!pending) {
    pending = readJson<Record_[]>(`${BASE}${key}.json`).catch((cause: unknown) => {
      cells.delete(key)
      throw cause
    })
    cells.set(key, pending)
  }
  return pending
}

/** Clés des cellules d'un degré qui recouvrent une emprise. */
function cellKeys(bbox: Bbox): string[] {
  const keys: string[] = []
  for (let lat = Math.floor(bbox.minLat); lat <= Math.floor(bbox.maxLat); lat += 1) {
    for (let lon = Math.floor(bbox.minLon); lon <= Math.floor(bbox.maxLon); lon += 1) {
      keys.push(`${lat}_${lon}`)
      if (keys.length >= MAX_CELLS) return keys
    }
  }
  return keys
}

/** Date de génération de la donnée, pour l'afficher dans la fiche. */
export async function playgroundsDate(): Promise<string | null> {
  try {
    return (await loadManifest()).generatedAt
  } catch {
    return null
  }
}

/** Charge les aires de jeux contenues dans une emprise géographique. */
export async function fetchPlaygroundsInBbox(
  bbox: Bbox,
  filters: Filters,
  signal?: AbortSignal,
): Promise<PlaygroundsResult> {
  let manifest: Manifest
  try {
    manifest = await loadManifest()
  } catch {
    throw new PlaygroundsError('La carte des aires de jeux n’a pas pu être chargée.')
  }

  // Les cellules absentes du manifeste sont vides (mer, forêt) : aucun appel à faire.
  const keys = cellKeys(bbox).filter((key) => manifest.cells[key])
  let records: Record_[]
  try {
    records = (await Promise.all(keys.map(loadCell))).flat()
  } catch {
    throw new PlaygroundsError('Une partie des aires de jeux n’a pas pu être chargée.')
  }
  if (signal?.aborted) throw new DOMException('Chargement abandonné', 'AbortError')

  let items = records
    .filter(
      ([, , lat, lon]) =>
        lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon,
    )
    .map(toPlayground)

  const truncated = items.length > MAX_PLAYGROUNDS
  if (truncated) items = items.slice(0, MAX_PLAYGROUNDS)

  // Ces filtres ne pouvaient pas être posés à la génération sans mentir : une aire sans
  // étiquette `lit` n'est pas une aire non éclairée, elle est non renseignée.
  if (filters.litOnly) items = items.filter((item) => item.lit)
  if (filters.accessibleOnly) items = items.filter((item) => item.accessible)

  return { items, truncated }
}

/**
 * Charge une aire de jeux par son identifiant, pour un lien partagé (`?e=osm:way/123`).
 * Le partage écrit toujours `lat`/`lng` dans l'URL : la position dit quelle cellule
 * ouvrir, et il n'y a rien d'autre à chercher.
 */
export async function fetchPlaygroundDetail(
  id: string,
  near: { lat: number; lon: number } | null,
): Promise<EquipmentDetail | null> {
  if (!near) return null
  const reference = id.slice(ID_PREFIX.length)
  const match = /^(node|way|relation)\/(\d+)$/.exec(reference)
  if (!match) return null
  const kind = KINDS.indexOf(match[1] as (typeof KINDS)[number])
  const osmId = Number(match[2])

  const key = `${Math.floor(near.lat)}_${Math.floor(near.lon)}`
  try {
    const manifest = await loadManifest()
    if (!manifest.cells[key]) return null
    const record = (await loadCell(key)).find(([k, i]) => k === kind && i === osmId)
    return record ? toPlayground(record) : null
  } catch {
    return null
  }
}
