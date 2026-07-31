import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bbox, Equipment, Filters, LngLat } from '../types'
import { DataEsError, countEquipmentsInBbox, fetchEquipmentsInBbox } from '../lib/dataes'
import { filtersKey, lookup, store } from '../lib/cache'
import { bboxKey, distanceMeters, padBbox } from '../lib/geo'

/** En dessous de ce zoom, l'emprise couvre trop de territoire pour être chargée. */
export const MIN_ZOOM_FOR_DATA = 10.5

const DEBOUNCE_MS = 400

interface Options {
  bbox: Bbox | null
  zoom: number
  filters: Filters
  /** Point de référence pour le tri par distance (position GPS, sinon centre de carte). */
  origin: LngLat | null
}

export interface EquipmentsState {
  items: Equipment[]
  loading: boolean
  error: string | null
  truncated: boolean
  /** Nombre réel d'équipements dans la zone, connu seulement si la liste est tronquée. */
  total: number | null
  /** Vrai si l'utilisateur doit zoomer avant tout chargement. */
  zoomedOut: boolean
  reload: () => void
}

export function useEquipments({ bbox, zoom, filters, origin }: Options): EquipmentsState {
  const [items, setItems] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const zoomedOut = zoom < MIN_ZOOM_FOR_DATA
  const key = filtersKey(filters)
  const query = bbox && !zoomedOut ? bboxKey(padBbox(bbox)) : null

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!bbox || zoomedOut) {
      abortRef.current?.abort()
      setLoading(false)
      setItems([])
      setTruncated(false)
      setTotal(null)
      setError(null)
      return
    }

    const padded = padBbox(bbox)
    const cached = lookup(padded, key)
    if (cached) {
      setItems(cached.items)
      setTruncated(cached.truncated)
      setTotal(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const timer = window.setTimeout(() => {
      fetchEquipmentsInBbox(padded, filters, controller.signal)
        .then((result) => {
          store(padded, key, result)
          setItems(result.items)
          setTruncated(result.truncated)
          setError(null)
          setTotal(null)
          // Liste plafonnée : on va chercher le nombre réel pour l'annoncer.
          if (result.truncated) {
            countEquipmentsInBbox(padded, filters, controller.signal)
              .then(setTotal)
              .catch(() => undefined)
          }
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(
            cause instanceof DataEsError
              ? cause.message
              : 'Impossible de charger les équipements pour le moment.',
          )
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // `query` résume l'emprise arrondie et `key` les filtres : on ne relance pas la
    // requête pour un déplacement de quelques mètres.
  }, [query, key, zoomedOut, nonce])

  const sorted = useMemo(() => {
    if (!origin) return items
    return items
      .map((item) => ({ ...item, distance: distanceMeters(origin, item) }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
  }, [items, origin])

  return {
    items: sorted,
    loading,
    error,
    truncated,
    total,
    zoomedOut,
    reload: () => setNonce((n) => n + 1),
  }
}
