/**
 * Client Overpass — aires de jeux pour enfants (`leisure=playground`).
 *
 * Pourquoi une seconde source alors que tout le reste vient du RES : le Recensement
 * des équipements sportifs ne recense que du **sport**. Ses 185 valeurs de
 * `equip_type_name` ne contiennent aucune aire de jeux ; la plus proche,
 * « Parc Mobil'Ludique » (144 enregistrements), est une piste d'éducation routière.
 * data.gouv.fr n'a que des jeux de données communaux isolés (Anglet, Fleury-les-Aubrais…).
 * Il n'existe donc **aucun référentiel national** des aires de jeux : OpenStreetMap est
 * la seule couverture complète (45 922 objets en France, dont deux tiers en polygones).
 *
 * Overpass est un service bénévole, sensiblement plus lent et plus fragile que
 * l'API du ministère (2 à 15 s selon la charge, erreurs « too busy » régulières,
 * réponse HTML avec un statut 200 quand ça se passe mal). D'où trois précautions :
 * la catégorie est décochée par défaut, l'appel est indépendant de celui de Data ES,
 * et un échec ne remonte qu'un avertissement discret sans casser la liste des sports.
 *
 * Les miroirs publics ont été mesurés et écartés : `overpass.kumi.systems` répond 504
 * après deux minutes, `overpass.private.coffee` met 56 s et sert des données d'un mois.
 */
import type { Bbox, EquipmentDetail, Filters } from '../types'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'

/** Plafond d'aires de jeux chargées pour une vue (Paris entier en compte ~1 400). */
export const MAX_PLAYGROUNDS = 900

/**
 * Budget serveur laissé à Overpass, puis budget client. Le second est plus large :
 * il englobe l'attente en file quand l'instance est saturée.
 */
const SERVER_TIMEOUT_S = 20
const CLIENT_TIMEOUT_MS = 25_000

/**
 * Une seule reprise, après une courte pause. Les échecs observés sont des 504 de
 * passerelle, des « too busy » et des rejets réseau : le service tourne, c'est le
 * répartiteur qui a lâché, et la tentative suivante passe le plus souvent. Mesuré
 * en série sur une même vue : **trois échecs sur huit appels**. On s'arrête à une
 * reprise — insister sur un service bénévole déjà saturé ne ferait qu'aggraver son
 * état, et le 429 (quota de l'adresse IP) n'est justement jamais repris.
 */
const RETRY_DELAY_MS = 1_500

/** Préfixe des identifiants OpenStreetMap, pour ne jamais les confondre avec le RES. */
const ID_PREFIX = 'osm:'

export class OverpassError extends Error {
  constructor(
    message: string,
    /** Vrai si une seconde tentative a des chances d'aboutir (panne passagère). */
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'OverpassError'
  }
}

export function isPlaygroundId(id: string): boolean {
  return id.startsWith(ID_PREFIX)
}

/** Lien vers l'objet sur openstreetmap.org, où la correction se fait directement. */
export function playgroundRecordUrl(id: string): string {
  return `https://www.openstreetmap.org/${id.slice(ID_PREFIX.length)}`
}

/**
 * Valeurs d'`access` qui excluent une aire de jeux : elle doit être ouverte à tous,
 * comme les équipements du RES retenus. `customers` élimine notamment les aires de
 * restaurants, `permissive` est conservé (ouvert par tolérance du propriétaire).
 */
const CLOSED_ACCESS = ['private', 'customers', 'no', 'permit', 'members', 'residents']

/**
 * Aire ouverte à tous, en plein air et gratuite — l'équivalent OSM du filtre
 * « accès libre + propriétaire public » appliqué au RES. L'absence d'étiquette vaut
 * autorisation : c'est le cas majoritaire, et une lacune de saisie n'est pas une
 * restriction.
 *
 * Ce tri était d'abord posé **dans la requête**, en `["access"!~"…"]`. À ne pas y
 * remettre : une expression `!~` interdit à Overpass d'utiliser son index de tags et
 * lui fait balayer toute l'emprise. Mesuré sur une vue de 346 km² autour de Valence,
 * **19,1 s avec, 1,4 s sans** — c'est ce qui rendait la catégorie inutilisable sur un
 * téléphone. Trier ici coûte 8 % de données transférées en plus (18 ko → 20 ko).
 */
function isOpenToAll(tags: Record<string, string>): boolean {
  if (tags.access && CLOSED_ACCESS.includes(tags.access)) return false
  return tags.indoor !== 'yes' && tags.fee !== 'yes'
}

/** Équipements de jeu (`playground=*`), traduits pour la liste « Activités ». */
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

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

export interface PlaygroundsResult {
  items: EquipmentDetail[]
  truncated: boolean
}

function bboxClause(bbox: Bbox): string {
  // Overpass attend la latitude d'abord, comme `in_bbox` côté Data ES.
  return `(${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon})`
}

/**
 * Construit la requête Overpass QL, volontairement réduite à **un seul critère de
 * tag** : c'est le seul que l'index sache servir. Tout le reste du tri se fait à la
 * réception (voir `isOpenToAll`), pour une raison de vitesse mesurée, pas de style.
 *
 * `nwr` couvre les trois primitives : deux aires de jeux sur trois sont dessinées en
 * polygone, `out center` les ramène toutes à un point.
 */
export function buildQuery(bbox: Bbox, limit = MAX_PLAYGROUNDS): string {
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];nwr["leisure"="playground"]${bboxClause(bbox)};out tags center ${limit};`
}

function str(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Traduit une valeur d'étiquette, sinon la rend telle quelle (première lettre en capitale). */
function translate(dictionary: Record<string, string>, value: string): string {
  return dictionary[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

/**
 * Équipements de jeu déclarés. OpenStreetMap les note soit en liste séparée par des
 * points-virgules (`playground=slide;climbingframe`), soit en étiquettes numérotées
 * (`playground_1`, `playground_2`…) quand plusieurs valeurs coexistent.
 */
function readFeatures(tags: Record<string, string>): string[] {
  const raw: string[] = []
  for (const [key, value] of Object.entries(tags)) {
    if (key === 'playground' || /^playground_\d+$/.test(key)) raw.push(...value.split(';'))
  }
  const labels = raw.map((value) => translate(FEATURES, value.trim())).filter(Boolean)
  return [...new Set(labels)]
}

function readAgeRange(tags: Record<string, string>): string | null {
  const min = str(tags.min_age)
  const max = str(tags.max_age)
  if (min && max) return `${min} à ${max} ans`
  if (min) return `À partir de ${min} ans`
  if (max) return `Jusqu’à ${max} ans`
  return null
}

/**
 * Convertit un objet OSM en fiche complète. Contrairement au RES, la réponse de liste
 * porte déjà **toutes** les étiquettes : aucune seconde requête n'est nécessaire pour
 * ouvrir la fiche d'une aire de jeux.
 */
function toPlayground(element: OverpassElement): EquipmentDetail | null {
  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const tags = element.tags ?? {}
  const address = [str(tags['addr:housenumber']), str(tags['addr:street'])]
    .filter(Boolean)
    .join(' ')

  return {
    id: `${ID_PREFIX}${element.type}/${element.id}`,
    source: 'osm',
    // Trois aires sur quatre n'ont pas de nom dans OSM : le type fait alors office
    // de titre, comme pour un équipement du RES sans `equip_nom`. Nom et type sont
    // volontairement identiques dans ce cas — la liste et la fiche savent alors
    // qu'il ne faut pas écrire deux fois la même ligne (`sameLabel`).
    name: str(tags.name) ?? 'Aire de jeux',
    installation: str(tags.operator),
    type: 'Aire de jeux',
    sports: readFeatures(tags),
    address: address || null,
    postcode: str(tags['addr:postcode']),
    city: str(tags['addr:city']),
    // Les aires en salle sont écartées à la requête : ce qui reste est en plein air,
    // ce qui rend le filtre « Plein air uniquement » cohérent avec le RES.
    nature: 'Découvert',
    lit: tags.lit === 'yes',
    accessible: tags.wheelchair === 'yes',
    lon: lon as number,
    lat: lat as number,
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
 * Une tentative d'appel, sans reprise.
 *
 * Le piège maison : quand l'instance est saturée elle répond **200 avec une page
 * HTML** (« The server is probably too busy… »). Il faut donc valider le corps, pas
 * seulement le statut.
 */
async function attempt(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)

  // Distinguer notre propre délai du reste : sans ce drapeau, un `fetch` rejeté en
  // 200 ms était annoncé comme un dépassement de délai de 25 s. Le message envoyait
  // alors chercher la panne exactement là où elle n'était pas.
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    abort()
  }, CLIENT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    })
  } catch (cause) {
    // L'abandon demandé par l'appelant doit remonter tel quel : il est normal.
    if (signal?.aborted && !timedOut) throw cause

    if (timedOut) {
      throw new OverpassError(
        'OpenStreetMap n’a pas répondu à temps pour les aires de jeux.',
        true,
      )
    }

    // Le `fetch` a été rejeté sans que nous l'ayons interrompu : la requête n'est
    // jamais partie, ou le navigateur a refusé la réponse. Depuis un téléphone, le
    // message du navigateur est la seule piste exploitable — on le montre.
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new OverpassError(
      `Impossible de joindre OpenStreetMap pour les aires de jeux. Le navigateur répond : « ${detail} ».`,
      true,
    )
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }

  if (!response.ok) {
    // 429 : quota de l'adresse IP atteint, réessayer tout de suite n'aiderait pas.
    if (response.status === 429) {
      throw new OverpassError(
        'Trop de requêtes envoyées à OpenStreetMap. Les aires de jeux réapparaîtront dans un instant.',
      )
    }
    throw new OverpassError(
      'Les aires de jeux d’OpenStreetMap sont momentanément indisponibles.',
      response.status >= 500,
    )
  }

  try {
    return (await response.json()) as OverpassResponse
  } catch {
    // Corps non-JSON avec un statut 200 : c'est la page « too busy » du répartiteur.
    throw new OverpassError(
      'Le serveur OpenStreetMap est surchargé : les aires de jeux ne sont pas affichées.',
      true,
    )
  }
}

/** Appelle Overpass, avec une seule reprise sur les pannes passagères. */
async function runQuery(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  try {
    return await attempt(query, signal)
  } catch (cause) {
    if (signal?.aborted) throw cause
    if (!(cause instanceof OverpassError) || !cause.retryable) throw cause
    await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS))
    if (signal?.aborted) throw cause
    return attempt(query, signal)
  }
}

function toPlaygrounds(elements: OverpassElement[]): EquipmentDetail[] {
  const items: EquipmentDetail[] = []
  for (const element of elements) {
    const item = toPlayground(element)
    if (item) items.push(item)
  }
  return items
}

/** Charge les aires de jeux contenues dans une emprise géographique. */
export async function fetchPlaygroundsInBbox(
  bbox: Bbox,
  filters: Filters,
  signal?: AbortSignal,
): Promise<PlaygroundsResult> {
  const data = await runQuery(buildQuery(bbox), signal)
  const elements = data.elements ?? []

  // Le plafond est appliqué par Overpass, donc avant nos propres tris : c'est bien le
  // nombre brut reçu qui dit si la vue a été coupée.
  const truncated = elements.length >= MAX_PLAYGROUNDS

  let items = toPlaygrounds(elements.filter((element) => isOpenToAll(element.tags ?? {})))

  // Ces deux filtres-là ne peuvent pas non plus être posés dans la requête, mais pour
  // une autre raison : une aire sans étiquette `lit` n'est pas une aire non éclairée,
  // elle est non renseignée. Les poser côté serveur ferait passer une lacune de
  // saisie pour une réponse.
  if (filters.litOnly) items = items.filter((item) => item.lit)
  if (filters.accessibleOnly) items = items.filter((item) => item.accessible)

  return { items, truncated }
}

/**
 * Charge une aire de jeux par son identifiant, pour un lien partagé (`?e=osm:way/123`).
 * C'est le seul cas où une fiche demande un appel supplémentaire.
 */
export async function fetchPlaygroundDetail(
  id: string,
  signal?: AbortSignal,
): Promise<EquipmentDetail | null> {
  const reference = id.slice(ID_PREFIX.length)
  const match = /^(node|way|relation)\/(\d+)$/.exec(reference)
  if (!match) return null
  const query = `[out:json][timeout:${SERVER_TIMEOUT_S}];${match[1]}(${match[2]});out tags center;`
  const data = await runQuery(query, signal)
  // Pas de tri sur l'accès ici : un lien partagé désigne un point précis, on montre
  // ce qu'il désigne.
  return toPlaygrounds(data.elements ?? [])[0] ?? null
}
