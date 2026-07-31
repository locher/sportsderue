/**
 * L'état de l'application vit dans l'URL : une vue est ainsi partageable
 * (« regarde les city-stades autour de chez moi ») et rechargeable.
 */
import type { Filters, MapPosition } from '../types'
import {
  ALL_CATEGORY_IDS,
  DEFAULT_CATEGORY_IDS,
  isCategoryId,
  type CategoryId,
} from './sports'

export interface AppState {
  position: MapPosition | null
  filters: Filters
  selectedId: string | null
}

export const DEFAULT_FILTERS: Filters = {
  categories: DEFAULT_CATEGORY_IDS,
  outdoorOnly: false,
  litOnly: false,
  accessibleOnly: false,
}

function parseCategories(raw: string | null): CategoryId[] {
  if (raw === null) return DEFAULT_FILTERS.categories
  if (raw === 'all') return ALL_CATEGORY_IDS
  if (raw === '') return []
  const ids = raw.split(',').filter(isCategoryId)
  return ids.length ? ids : DEFAULT_FILTERS.categories
}

function serializeCategories(categories: CategoryId[]): string {
  if (categories.length === ALL_CATEGORY_IDS.length) return 'all'
  return categories.join(',')
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function readState(search: string = window.location.search): AppState {
  const params = new URLSearchParams(search)
  const lat = parseNumber(params.get('lat'))
  const lon = parseNumber(params.get('lng') ?? params.get('lon'))
  const zoom = parseNumber(params.get('z'))
  const flags = new Set((params.get('f') ?? '').split(',').filter(Boolean))

  return {
    position:
      lat !== null && lon !== null
        ? { lat, lon, zoom: zoom ?? 14 }
        : null,
    filters: {
      categories: parseCategories(params.get('s')),
      outdoorOnly: flags.has('air'),
      litOnly: flags.has('eclaire'),
      accessibleOnly: flags.has('pmr'),
    },
    selectedId: params.get('e'),
  }
}

export function writeState(state: AppState): void {
  const params = new URLSearchParams()
  if (state.position) {
    params.set('lat', state.position.lat.toFixed(5))
    params.set('lng', state.position.lon.toFixed(5))
    params.set('z', state.position.zoom.toFixed(1))
  }

  const categories = serializeCategories(state.filters.categories)
  if (categories !== serializeCategories(DEFAULT_FILTERS.categories)) params.set('s', categories)

  const flags = [
    state.filters.outdoorOnly ? 'air' : null,
    state.filters.litOnly ? 'eclaire' : null,
    state.filters.accessibleOnly ? 'pmr' : null,
  ].filter(Boolean)
  if (flags.length) params.set('f', flags.join(','))

  if (state.selectedId) params.set('e', state.selectedId)

  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`
  window.history.replaceState(null, '', url)
}

const STORAGE_KEY = 'sportsderue.filters.v1'

/** Les filtres sont mémorisés d'une visite à l'autre (sans compte, sans cookie). */
export function loadStoredFilters(): Filters | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Filters>
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c): c is CategoryId => typeof c === 'string' && isCategoryId(c))
      : null
    if (!categories) return null
    return {
      categories,
      outdoorOnly: Boolean(parsed.outdoorOnly),
      litOnly: Boolean(parsed.litOnly),
      accessibleOnly: Boolean(parsed.accessibleOnly),
    }
  } catch {
    return null
  }
}

export function storeFilters(filters: Filters): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Mode navigation privée / stockage plein : on continue sans mémoriser.
  }
}
