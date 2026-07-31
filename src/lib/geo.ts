import type { Bbox, LngLat } from '../types'

const EARTH_RADIUS_M = 6_371_008.8

/** Distance à vol d'oiseau entre deux points, en mètres (formule de haversine). */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** « 350 m », « 2,4 km », « 12 km » */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return ''
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  const km = meters / 1000
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}

/** Emprise élargie d'un facteur donné, pour précharger un peu autour de la vue. */
export function padBbox(bbox: Bbox, factor = 0.15): Bbox {
  const dLon = (bbox.maxLon - bbox.minLon) * factor
  const dLat = (bbox.maxLat - bbox.minLat) * factor
  return {
    minLon: clampLon(bbox.minLon - dLon),
    maxLon: clampLon(bbox.maxLon + dLon),
    minLat: clampLat(bbox.minLat - dLat),
    maxLat: clampLat(bbox.maxLat + dLat),
  }
}

/** Emprise carrée centrée sur un point, `radiusMeters` de demi-côté. */
export function bboxAround(center: LngLat, radiusMeters: number): Bbox {
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const cos = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180))
  const dLon = dLat / cos
  return {
    minLon: clampLon(center.lon - dLon),
    maxLon: clampLon(center.lon + dLon),
    minLat: clampLat(center.lat - dLat),
    maxLat: clampLat(center.lat + dLat),
  }
}

export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer.minLon <= inner.minLon &&
    outer.minLat <= inner.minLat &&
    outer.maxLon >= inner.maxLon &&
    outer.maxLat >= inner.maxLat
  )
}

/** Diagonale approximative de l'emprise, en mètres. */
export function bboxDiagonalMeters(bbox: Bbox): number {
  return distanceMeters(
    { lon: bbox.minLon, lat: bbox.minLat },
    { lon: bbox.maxLon, lat: bbox.maxLat },
  )
}

/** Clé stable (arrondie) pour mettre en cache une emprise. */
export function bboxKey(bbox: Bbox): string {
  const r = (v: number) => v.toFixed(3)
  return `${r(bbox.minLon)},${r(bbox.minLat)},${r(bbox.maxLon)},${r(bbox.maxLat)}`
}

function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat))
}

function clampLon(lon: number): number {
  return Math.max(-180, Math.min(180, lon))
}

/** France métropolitaine + marge, vue par défaut. */
export const FRANCE_CENTER: LngLat = { lon: 2.4, lat: 46.6 }
export const FRANCE_ZOOM = 5.1

/** Lien d'itinéraire dans l'application de cartographie du téléphone. */
export function directionsUrl(point: LngLat, label?: string): string {
  const isApple =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) &&
    !/Chrome|Android/.test(navigator.userAgent)
  const coords = `${point.lat},${point.lon}`
  if (isApple) {
    const params = new URLSearchParams({ daddr: coords, dirflg: 'w' })
    if (label) params.set('q', label)
    return `https://maps.apple.com/?${params}`
  }
  const params = new URLSearchParams({
    api: '1',
    destination: coords,
    travelmode: 'walking',
  })
  return `https://www.google.com/maps/dir/?${params}`
}
