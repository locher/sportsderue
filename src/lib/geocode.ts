/**
 * Recherche de lieux via le service de géocodage de la Géoplateforme (IGN),
 * qui expose la Base Adresse Nationale. Sans clé, CORS ouvert.
 * https://data.geopf.fr/geocodage/
 */
import type { Place } from '../types'

const SEARCH_URL = 'https://data.geopf.fr/geocodage/search'
const REVERSE_URL = 'https://data.geopf.fr/geocodage/reverse'

interface BanFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    id?: string
    label?: string
    name?: string
    type?: string
    city?: string
    postcode?: string
    citycode?: string
    context?: string
    street?: string
  }
}

interface BanResponse {
  features?: BanFeature[]
}

function toPlace(feature: BanFeature, index: number): Place | null {
  const coords = feature.geometry?.coordinates
  const props = feature.properties
  if (!coords || coords.length < 2 || !props) return null

  const type = props.type ?? 'other'
  const kind: Place['kind'] =
    type === 'municipality' || type === 'street' || type === 'housenumber' || type === 'locality'
      ? type
      : 'other'

  // `context` vaut « 31, Haute-Garonne, Occitanie » : on garde département + région.
  const contextParts = (props.context ?? '').split(',').map((p) => p.trim())
  const area = contextParts.slice(1).join(' · ')
  const city = props.city && props.city !== props.name ? props.city : null
  const context = [city, props.postcode, area].filter(Boolean).join(' · ')

  return {
    id: props.id ?? `${props.label ?? 'lieu'}-${index}`,
    label: props.label ?? props.name ?? 'Lieu',
    context,
    lon: coords[0],
    lat: coords[1],
    kind,
    postcode: props.postcode,
    citycode: props.citycode,
  }
}

/** Autocomplétion : villes, quartiers, rues et adresses. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    q: trimmed,
    limit: '8',
    autocomplete: '1',
    index: 'address',
  })

  const response = await fetch(`${SEARCH_URL}?${params}`, { signal })
  if (!response.ok) throw new Error(`Géocodage indisponible (${response.status})`)
  const data = (await response.json()) as BanResponse

  const places = (data.features ?? [])
    .map(toPlace)
    .filter((p): p is Place => p !== null)
    // Les communes d'abord : c'est le cas d'usage principal (« rechercher une ville »).
    .sort((a, b) => rank(a) - rank(b))

  return places
}

function rank(place: Place): number {
  switch (place.kind) {
    case 'municipality':
      return 0
    case 'locality':
      return 1
    case 'street':
      return 2
    default:
      return 3
  }
}

/** Géocodage inverse : nom de la commune la plus proche d'un point. */
export async function reverseCity(
  lon: number,
  lat: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    lon: lon.toFixed(6),
    lat: lat.toFixed(6),
    limit: '1',
    index: 'address',
  })
  try {
    const response = await fetch(`${REVERSE_URL}?${params}`, { signal })
    if (!response.ok) return null
    const data = (await response.json()) as BanResponse
    const props = data.features?.[0]?.properties
    return props?.city ?? props?.name ?? null
  } catch {
    return null
  }
}

/** Zoom conseillé pour un résultat de recherche. */
export function zoomForPlace(place: Place): number {
  switch (place.kind) {
    case 'municipality':
      return 13
    case 'locality':
      return 14
    case 'street':
      return 15.5
    default:
      return 16
  }
}
