/**
 * Client de l'API Data ES — Recensement des équipements sportifs et lieux de pratique
 * (ministère chargé des Sports), servie par Opendatasoft Explore API v2.1.
 *
 * Docs : https://equipements.sports.gouv.fr/explore/dataset/data-es/api/
 * Aucune clé nécessaire, CORS ouvert, quota anonyme de 5 000 appels/jour et par IP :
 * on interroge donc l'API directement depuis le navigateur, sans backend, et on met
 * les réponses en cache (mémoire + service worker).
 */
import type { Bbox, Equipment, EquipmentDetail, Filters } from '../types'
import { CATEGORY_BY_ID, categoryOf, type CategoryGroup, type CategoryId } from './sports'

const DATASET_URL =
  'https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es'

/** Natures d'équipement considérées comme « plein air ». */
export const OUTDOOR_NATURES = [
  'Découvert',
  'Découvrable',
  'Extérieur couvert',
  'Site naturel',
  'Site naturel aménagé',
  'Site artificiel',
]

/** Natures d'équipement de plein air « urbain » (pour les tables de ping-pong par ex.). */
const OPEN_AIR_NATURES = ['Découvert', 'Découvrable', 'Extérieur couvert']

/**
 * Propriétaires retenus : on ne garde que les équipements portés par une personne
 * publique, pour rester sur des installations mises à disposition gratuitement.
 * Les établissements privés commerciaux (salles de sport…) sont ainsi exclus, même
 * lorsqu'ils sont déclarés en accès libre.
 */
const PUBLIC_OWNER_TYPES = [
  'Commune',
  'EPCI',
  'Département',
  'Région',
  'Etat',
  'Etablissement Public',
  'Multi-propriétaire',
]

/** Champs récupérés pour la carte et la liste (payload volontairement léger). */
const LIST_FIELDS = [
  'equip_numero',
  'equip_nom',
  'inst_nom',
  'equip_type_name',
  'aps_name',
  'inst_adresse',
  'inst_cp',
  'new_name',
  'equip_nature',
  'equip_eclair',
  'equip_pmr_acc',
  'equip_coordonnees',
]

/** Nombre maximum d'équipements chargés pour une vue. Au-delà, on invite à zoomer. */
export const MAX_FEATURES = 1500

export class DataEsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'DataEsError'
  }
}

/** Échappe une valeur pour une clause ODSQL (littéral entre guillemets doubles). */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function inList(field: string, values: string[]): string {
  return `${field} IN (${values.map(quote).join(', ')})`
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Prédicat des catégories cochées.
 *
 * Un équipement est retenu s'il **est** du bon type (`equip_type_name`) ou si l'activité
 * cherchée y **est praticable** (`aps_name`) : c'est cette seconde branche qui fait
 * remonter un city-stade sous le filtre « Basket », un plateau multisports sous
 * « Handball », etc.
 *
 * Le type est un signal fort, l'activité un signal faible — un gymnase peut déclarer dix
 * activités et remonter sous dix filtres. La branche « activité » est donc restreinte au
 * plein air : hors salle pour les catégories urbaines, sites naturels compris pour les
 * catégories nature (une baignade aménagée n'est ni « Découvert » ni en salle).
 *
 * Les valeurs sont mises en commun entre catégories plutôt qu'un prédicat par catégorie :
 * le résultat est identique (une union de disjonctions) mais l'URL reste deux fois plus
 * courte, ce qui compte avec 17 catégories cochées.
 */
function categoriesPredicate(ids: CategoryId[]): string {
  // Les catégories servies par une autre base (les aires de jeux, venues d'OSM) n'ont
  // rien à faire dans une clause ODSQL : elles sont écartées avant tout le reste.
  const categories = ids.map((id) => CATEGORY_BY_ID[id]).filter((c) => c?.source === 'res')
  const sportsOf = (group: CategoryGroup) =>
    unique(categories.filter((c) => c.group === group).flatMap((c) => c.sports))

  const types = unique(categories.flatMap((c) => c.types))
  const urbanSports = sportsOf('urbain')
  const natureSports = sportsOf('nature')

  const alternatives: string[] = []
  if (types.length) alternatives.push(inList('equip_type_name', types))
  if (urbanSports.length) {
    alternatives.push(
      `(${inList('aps_name', urbanSports)} AND ${inList('equip_nature', OPEN_AIR_NATURES)})`,
    )
  }
  if (natureSports.length) {
    alternatives.push(
      `(${inList('aps_name', natureSports)} AND ${inList('equip_nature', OUTDOOR_NATURES)})`,
    )
  }

  // Aucune catégorie cochée : on ne renvoie rien plutôt que la France entière. ODSQL n'a
  // pas de littéral booléen (`FALSE` est une erreur de syntaxe), d'où la comparaison.
  if (!alternatives.length) return '1 = 2'
  return `(${alternatives.join(' OR ')})`
}

/** Construit la clause `where` complète à partir des filtres actifs. */
export function buildWhere(filters: Filters, extra?: string): string {
  const clauses: string[] = [
    'equip_acc_libre = "true"',
    inList('equip_prop_type', PUBLIC_OWNER_TYPES),
    categoriesPredicate(filters.categories),
  ]

  if (filters.outdoorOnly) clauses.push(inList('equip_nature', OUTDOOR_NATURES))
  if (filters.litOnly) clauses.push('equip_eclair = "true"')
  if (filters.accessibleOnly) clauses.push('equip_pmr_acc = "true"')
  if (extra) clauses.push(extra)

  return clauses.join(' AND ')
}

function bool(value: unknown): boolean {
  return value === 'true' || value === true
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function asSports(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string' && value.trim()) {
    // Certaines vues renvoient la liste sérialisée en JSON.
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      return [value]
    }
  }
  return []
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'None' || trimmed === 'null') return null
  return trimmed
}

type Props = Record<string, unknown>

function toEquipment(props: Props, lon: number, lat: number): Equipment {
  const sports = asSports(props.aps_name)
  const type = str(props.equip_type_name) ?? 'Équipement sportif'
  return {
    id: String(props.equip_numero ?? `${lon},${lat}`),
    source: 'res',
    name: str(props.equip_nom) ?? str(props.inst_nom) ?? type,
    installation: str(props.inst_nom),
    type,
    sports,
    address: str(props.inst_adresse),
    postcode: str(props.inst_cp),
    city: str(props.new_name),
    nature: str(props.equip_nature),
    lit: bool(props.equip_eclair),
    accessible: bool(props.equip_pmr_acc),
    lon,
    lat,
    category: categoryOf(type, sports),
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new DataEsError('Connexion impossible. Vérifiez votre réseau.')
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new DataEsError(
        'Trop de requêtes envoyées à l’API du ministère des Sports. Réessayez dans un instant.',
        429,
      )
    }
    throw new DataEsError(
      `L’API des équipements sportifs a répondu ${response.status}.`,
      response.status,
    )
  }

  return (await response.json()) as T
}

interface GeoJsonResponse {
  features?: {
    geometry: { coordinates: [number, number] } | null
    properties: Props
  }[]
}

export interface EquipmentsResult {
  items: Equipment[]
  /** Vrai si la vue contient probablement plus d'équipements que la limite chargée. */
  truncated: boolean
}

/**
 * Charge les équipements contenus dans une emprise géographique.
 * On utilise l'export GeoJSON : une seule requête suffit, là où l'endpoint `/records`
 * plafonne à 100 résultats par appel.
 */
export async function fetchEquipmentsInBbox(
  bbox: Bbox,
  filters: Filters,
  signal?: AbortSignal,
): Promise<EquipmentsResult> {
  const inBbox = `in_bbox(equip_coordonnees, ${bbox.minLat}, ${bbox.minLon}, ${bbox.maxLat}, ${bbox.maxLon})`
  const params = new URLSearchParams({
    select: LIST_FIELDS.join(','),
    where: buildWhere(filters, inBbox),
    limit: String(MAX_FEATURES),
  })

  const data = await getJson<GeoJsonResponse>(`${DATASET_URL}/exports/geojson?${params}`, signal)
  const items: Equipment[] = []
  for (const feature of data.features ?? []) {
    const coords = feature.geometry?.coordinates
    if (!coords || coords.length < 2) continue
    const [lon, lat] = coords
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    items.push(toEquipment(feature.properties ?? {}, lon, lat))
  }

  return { items, truncated: items.length >= MAX_FEATURES }
}

interface RecordsResponse {
  total_count: number
  results: Props[]
}

/** Compte les équipements correspondant aux filtres dans une emprise. */
export async function countEquipmentsInBbox(
  bbox: Bbox,
  filters: Filters,
  signal?: AbortSignal,
): Promise<number> {
  const inBbox = `in_bbox(equip_coordonnees, ${bbox.minLat}, ${bbox.minLon}, ${bbox.maxLat}, ${bbox.maxLon})`
  const params = new URLSearchParams({
    select: 'equip_numero',
    where: buildWhere(filters, inBbox),
    limit: '0',
  })
  const data = await getJson<RecordsResponse>(`${DATASET_URL}/records?${params}`, signal)
  return data.total_count
}

/** Charge la fiche complète d'un équipement à partir de son numéro national. */
export async function fetchEquipmentDetail(
  id: string,
  signal?: AbortSignal,
): Promise<EquipmentDetail | null> {
  const params = new URLSearchParams({
    where: `equip_numero = ${quote(id)}`,
    limit: '1',
  })
  const data = await getJson<RecordsResponse>(`${DATASET_URL}/records?${params}`, signal)
  const record = data.results?.[0]
  if (!record) return null

  const coords = record.equip_coordonnees as { lon?: number; lat?: number } | null
  const base = toEquipment(record, coords?.lon ?? 0, coords?.lat ?? 0)

  return {
    ...base,
    floor: str(record.equip_sol),
    length: num(record.equip_long),
    width: num(record.equip_larg),
    surface: num(record.equip_surf),
    showers: bool(record.equip_douche),
    toilets: bool(record.equip_sanit),
    changingRooms: bool(record.equip_vest_sport),
    ownerName: str(record.equip_prop_nom),
    ownerType: str(record.equip_prop_type),
    managerType: str(record.equip_gest_type),
    serviceDate: str(record.equip_service_date),
    worksDate: str(record.equip_travaux_date),
    seasonal: bool(record.equip_saison),
    url: str(record.equip_url),
    notes: str(record.equip_obs),
    installationNotes: str(record.inst_obs),
    updatedAt: str(record.equip_maj_date),
    department: str(record.dep_nom),
    region: str(record.reg_nom),
  }
}

/** Lien vers la fiche officielle de l'équipement sur le portail du ministère. */
export function officialRecordUrl(id: string): string {
  const params = new URLSearchParams({ 'refine.equip_numero': id })
  return `https://equipements.sports.gouv.fr/explore/dataset/data-es/table/?${params}`
}
