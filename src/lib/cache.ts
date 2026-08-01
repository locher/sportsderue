/**
 * Cache mémoire des résultats de l'API, pour éviter de rappeler Data ES à chaque
 * déplacement de carte (le quota anonyme est de 5 000 appels/jour et par IP).
 * Un résultat couvrant une emprise plus large est réutilisé lors d'un zoom avant.
 */
import type { Bbox, Equipment, Filters } from '../types'
import type { EquipmentsResult } from './dataes'
import { bboxContains } from './geo'

const MAX_ENTRIES = 24

interface CacheEntry {
  bbox: Bbox
  key: string
  result: EquipmentsResult
  at: number
}

const entries: CacheEntry[] = []

/** Signature des filtres : deux requêtes ne sont comparables qu'à filtres identiques. */
export function filtersKey(filters: Filters): string {
  return [
    [...filters.categories].sort().join('+'),
    filters.outdoorOnly ? 'o' : '',
    filters.litOnly ? 'l' : '',
    filters.accessibleOnly ? 'a' : '',
  ].join('|')
}

/**
 * Signature de la requête Overpass. La liste des catégories n'y entre pas — la requête
 * est toujours la même (`leisure=playground`) — et « plein air » non plus, puisque les
 * aires en salle sont déjà écartées. Le préfixe isole ces entrées de celles du RES.
 */
export function playgroundsKey(filters: Filters): string {
  return ['osm:jeux', filters.litOnly ? 'l' : '', filters.accessibleOnly ? 'a' : ''].join('|')
}

function inBbox(item: Equipment, bbox: Bbox): boolean {
  return (
    item.lon >= bbox.minLon &&
    item.lon <= bbox.maxLon &&
    item.lat >= bbox.minLat &&
    item.lat <= bbox.maxLat
  )
}

export function lookup(bbox: Bbox, key: string): EquipmentsResult | null {
  for (const entry of entries) {
    if (entry.key !== key) continue
    // Un résultat tronqué ne décrit pas complètement son emprise : on ne le réutilise pas.
    if (entry.result.truncated) continue
    if (!bboxContains(entry.bbox, bbox)) continue
    entry.at = Date.now()
    return { items: entry.result.items.filter((i) => inBbox(i, bbox)), truncated: false }
  }
  return null
}

export function store(bbox: Bbox, key: string, result: EquipmentsResult): void {
  entries.unshift({ bbox, key, result, at: Date.now() })
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b.at - a.at)
    entries.length = MAX_ENTRIES
  }
}

export function clearCache(): void {
  entries.length = 0
}
