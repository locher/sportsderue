import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bbox, Equipment, Filters, LngLat } from '../types'
import { DataEsError, countEquipmentsInBbox, fetchEquipmentsInBbox } from '../lib/dataes'
import { OverpassError, fetchPlaygroundsInBbox } from '../lib/overpass'
import { filtersKey, lookup, playgroundsKey, store } from '../lib/cache'
import { bboxKey, distanceMeters, padBbox } from '../lib/geo'
import { categoriesBySource } from '../lib/sports'

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
  /** Panne de la base principale : la liste est vide, on propose de réessayer. */
  error: string | null
  /**
   * Panne de la source secondaire (OpenStreetMap). Les équipements sportifs restent
   * affichés : c'est un avertissement, pas une erreur bloquante.
   */
  warning: string | null
  truncated: boolean
  /** Nombre réel d'équipements dans la zone, connu seulement si la liste est tronquée. */
  total: number | null
  /** Vrai si l'utilisateur doit zoomer avant tout chargement. */
  zoomedOut: boolean
  reload: () => void
}

/**
 * Charge ce qu'il faut afficher pour la vue courante.
 *
 * Les deux bases sont interrogées par des effets **séparés** : Overpass met 2 à 15 s
 * là où Data ES répond en une seconde, et tombe régulièrement en panne. Les fusionner
 * dans un seul `Promise.all` ferait attendre les terrains de basket derrière les aires
 * de jeux, et un échec d'OpenStreetMap viderait toute la carte.
 */
export function useEquipments({ bbox, zoom, filters, origin }: Options): EquipmentsState {
  const [items, setItems] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [total, setTotal] = useState<number | null>(null)

  const [playgrounds, setPlaygrounds] = useState<Equipment[]>([])
  const [playgroundsLoading, setPlaygroundsLoading] = useState(false)
  const [playgroundsTruncated, setPlaygroundsTruncated] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const [nonce, setNonce] = useState(0)

  const zoomedOut = zoom < MIN_ZOOM_FOR_DATA
  const sources = categoriesBySource(filters.categories)
  // Aucune catégorie du RES cochée : la réponse est vide par construction, on épargne
  // un appel à l'API (et son quota). Idem côté aires de jeux.
  const empty = sources.res.length === 0
  const withoutPlaygrounds = sources.osm.length === 0

  const key = filtersKey(filters)
  const osmKey = playgroundsKey(filters)
  const query = bbox && !zoomedOut ? bboxKey(padBbox(bbox)) : null

  const abortRef = useRef<AbortController | null>(null)
  const osmAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!bbox || zoomedOut || empty) {
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
  }, [query, key, zoomedOut, empty, nonce])

  // Aires de jeux (OpenStreetMap), même cycle mais sur son propre fil.
  useEffect(() => {
    if (!bbox || zoomedOut || withoutPlaygrounds) {
      osmAbortRef.current?.abort()
      setPlaygroundsLoading(false)
      setPlaygrounds([])
      setPlaygroundsTruncated(false)
      setWarning(null)
      return
    }

    const padded = padBbox(bbox)
    const cached = lookup(padded, osmKey)
    if (cached) {
      setPlaygrounds(cached.items)
      setPlaygroundsTruncated(cached.truncated)
      setWarning(null)
      setPlaygroundsLoading(false)
      return
    }

    setPlaygroundsLoading(true)
    const controller = new AbortController()
    osmAbortRef.current?.abort()
    osmAbortRef.current = controller

    const timer = window.setTimeout(() => {
      fetchPlaygroundsInBbox(padded, filters, controller.signal)
        .then((result) => {
          store(padded, osmKey, result)
          setPlaygrounds(result.items)
          setPlaygroundsTruncated(result.truncated)
          setWarning(null)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          // On garde la liste des sports : seules les aires de jeux manquent, et on le dit.
          setPlaygrounds([])
          setPlaygroundsTruncated(false)
          setWarning(
            cause instanceof OverpassError
              ? cause.message
              : 'Les aires de jeux d’OpenStreetMap n’ont pas pu être chargées.',
          )
        })
        .finally(() => {
          if (!controller.signal.aborted) setPlaygroundsLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, osmKey, zoomedOut, withoutPlaygrounds, nonce])

  const sorted = useMemo(() => {
    const merged = playgrounds.length ? [...items, ...playgrounds] : items
    if (!origin) return merged
    return merged
      .map((item) => ({ ...item, distance: distanceMeters(origin, item) }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
  }, [items, playgrounds, origin])

  return {
    items: sorted,
    loading: loading || playgroundsLoading,
    error,
    warning,
    truncated: truncated || playgroundsTruncated,
    // Le total ne compte que le RES : l'annoncer pendant que les aires de jeux sont
    // elles aussi plafonnées donnerait un chiffre faux.
    total: playgroundsTruncated ? null : total,
    zoomedOut,
    reload: () => setNonce((n) => n + 1),
  }
}
