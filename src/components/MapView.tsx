import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  AttributionControl,
  MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl'
// MapLibre déduit l'adresse de son worker de sa propre URL, ce qu'un bundler casse :
// on la lui donne explicitement, à partir du worker construit par Vite.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Bbox, Equipment, LngLat, MapPosition } from '../types'
import { CATEGORIES } from '../lib/sports'
import type { UserPosition } from '../hooks/useGeolocation'

/**
 * Fond de carte : Plan IGN v2 vectoriel, servi par la Géoplateforme.
 * Libre d'usage, sans clé d'API, et centré sur la France — ce qui convient bien ici.
 */
const STYLE_URL =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json'

setWorkerUrl(maplibreWorkerUrl)

const SOURCE_ID = 'equipements'
const LAYER_PINS = 'equipements-pins'
const LAYER_CLUSTERS = 'equipements-clusters'
const LAYER_CLUSTER_COUNT = 'equipements-clusters-count'
const LAYER_HALO = 'equipements-halo'

const ATTRIBUTION = [
  '<a href="https://www.ign.fr/" target="_blank" rel="noreferrer">IGN</a>',
  '<a href="https://equipements.sports.gouv.fr/" target="_blank" rel="noreferrer">Data ES — ministère des Sports</a>',
].join(' · ')

export interface MapViewHandle {
  /** Recentre la carte sur un point (recherche, géolocalisation). */
  flyTo(target: LngLat & { zoom?: number }): void
  /** Amène un équipement dans la zone visible s'il est masqué. */
  focus(target: LngLat, bottomPadding: number): void
}

interface Props {
  ref?: React.Ref<MapViewHandle>
  initialPosition: MapPosition
  items: Equipment[]
  selectedId: string | null
  userPosition: UserPosition | null
  onViewChange: (position: MapPosition, bbox: Bbox) => void
  onSelect: (id: string | null) => void
  onMoveStart?: () => void
}

/** Dessine une épingle : bulle blanche cerclée de la couleur de la catégorie + emoji. */
function pinImage(emoji: string, color: string, dpr: number): ImageData | null {
  const w = 34
  const h = 43
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)

  const cx = w / 2
  const cy = 15.5
  const r = 13

  // Pointe
  ctx.beginPath()
  ctx.moveTo(cx - 6.5, cy + 9)
  ctx.lineTo(cx, h - 2.5)
  ctx.lineTo(cx + 6.5, cy + 9)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()

  // Bulle
  ctx.shadowColor = 'rgba(18, 36, 31, 0.35)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.stroke()

  ctx.font =
    '16px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, cx, cy + 1)

  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function registerIcons(map: MapLibreMap): void {
  const dpr = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)))
  for (const category of CATEGORIES) {
    const id = `pin-${category.id}`
    if (map.hasImage(id)) continue
    const image = pinImage(category.emoji, category.color, dpr)
    if (!image) continue
    map.addImage(
      id,
      { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer) },
      { pixelRatio: dpr },
    )
  }
}

function toFeatureCollection(items: Equipment[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
      properties: { id: item.id, cat: item.category, name: item.name },
    })),
  }
}

function readBbox(map: MapLibreMap): Bbox {
  const bounds = map.getBounds()
  return {
    minLon: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLon: bounds.getEast(),
    maxLat: bounds.getNorth(),
  }
}

function readPosition(map: MapLibreMap): MapPosition {
  const center = map.getCenter()
  return { lon: center.lng, lat: center.lat, zoom: map.getZoom() }
}

function userMarkerElement(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'relative grid place-items-center'
  el.innerHTML = `
    <span class="absolute size-9 rounded-full bg-sky-500/20 animate-ping"></span>
    <span class="absolute size-6 rounded-full bg-sky-500/25"></span>
    <span class="size-3.5 rounded-full bg-sky-600 ring-2 ring-white shadow"></span>`
  el.setAttribute('aria-hidden', 'true')
  return el
}

export function MapView({
  ref,
  initialPosition,
  items,
  selectedId,
  userPosition,
  onViewChange,
  onSelect,
  onMoveStart,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const userMarker = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [styleError, setStyleError] = useState(false)

  // Les callbacks sont lus via une ref : les gestionnaires MapLibre ne sont posés qu'une fois.
  const handlers = useRef({ onViewChange, onSelect, onMoveStart })
  handlers.current = { onViewChange, onSelect, onMoveStart }

  useEffect(() => {
    if (!container.current || mapRef.current) return

    const map = new MapLibreMap({
      container: container.current,
      style: STYLE_URL,
      center: [initialPosition.lon, initialPosition.lat],
      zoom: initialPosition.zoom,
      minZoom: 4,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    // Poignée de débogage en développement (retirée du bundle de production).
    if (import.meta.env.DEV) Object.assign(window, { __map: map })

    // Attribution en bas à gauche : la colonne de droite et le bas de l'écran sont
    // occupés par les boutons flottants et la feuille de résultats.
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }),
      'bottom-left',
    )

    // Le style distant peut être momentanément indisponible : on prévient l'utilisateur
    // plutôt que de laisser une carte blanche.
    const styleWatchdog = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setStyleError(true)
    }, 12_000)
    map.on('styledata', () => setStyleError(false))

    map.on('load', () => {
      registerIcons(map)

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection([]),
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 13,
      })

      map.addLayer({
        id: LAYER_HALO,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 20,
          'circle-color': '#0f7b5f',
          'circle-opacity': 0.18,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f7b5f',
          'circle-stroke-opacity': 0.5,
        },
      })

      map.addLayer({
        id: LAYER_CLUSTERS,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0f7b5f',
          'circle-opacity': 0.92,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            17,
            10,
            21,
            50,
            26,
            200,
            32,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addLayer({
        id: LAYER_CLUSTER_COUNT,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Source Sans Pro Bold'],
          'text-size': 13,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      })

      map.addLayer({
        id: LAYER_PINS,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'cat']],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 1,
        },
      })

      setReady(true)
      handlers.current.onViewChange(readPosition(map), readBbox(map))
    })

    const emitView = () => handlers.current.onViewChange(readPosition(map), readBbox(map))
    map.on('moveend', emitView)
    map.on('movestart', () => handlers.current.onMoveStart?.())

    const pickFeature = (event: MapMouseEvent): MapGeoJSONFeature | null => {
      const pad = 10
      const features = map.queryRenderedFeatures(
        [
          [event.point.x - pad, event.point.y - pad],
          [event.point.x + pad, event.point.y + pad],
        ],
        { layers: [LAYER_PINS, LAYER_CLUSTERS] },
      )
      return features[0] ?? null
    }

    map.on('click', (event) => {
      const feature = pickFeature(event)
      if (!feature) {
        handlers.current.onSelect(null)
        return
      }

      if (feature.properties?.point_count) {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
        const clusterId = feature.properties.cluster_id as number
        const geometry = feature.geometry
        if (!source || geometry.type !== 'Point') return
        void source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom: Math.min(map.getMaxZoom(), zoom + 0.4),
              duration: 500,
            })
          })
          .catch(() => {
            map.easeTo({ zoom: map.getZoom() + 1.5, duration: 400 })
          })
        return
      }

      const id = feature.properties?.id
      if (typeof id === 'string') handlers.current.onSelect(id)
    })

    for (const layer of [LAYER_PINS, LAYER_CLUSTERS]) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    return () => {
      window.clearTimeout(styleWatchdog)
      userMarker.current?.remove()
      userMarker.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // La carte n'est créée qu'une fois : la position initiale n'est lue qu'au montage.
  }, [])

  // Données
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(toFeatureCollection(items))
  }, [items, ready])

  // Mise en évidence de l'équipement sélectionné
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter(LAYER_HALO, ['==', ['get', 'id'], selectedId ?? ''])
  }, [selectedId, ready])

  // Position de l'utilisateur
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userPosition) {
      userMarker.current?.remove()
      userMarker.current = null
      return
    }
    if (!userMarker.current) {
      userMarker.current = new Marker({ element: userMarkerElement() }).setLngLat([
        userPosition.lon,
        userPosition.lat,
      ])
      userMarker.current.addTo(map)
    } else {
      userMarker.current.setLngLat([userPosition.lon, userPosition.lat])
    }
  }, [userPosition])

  const flyTo = useCallback((target: LngLat & { zoom?: number }) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [target.lon, target.lat],
      zoom: target.zoom ?? Math.max(map.getZoom(), 14),
      duration: 900,
      essential: true,
    })
  }, [])

  useImperativeHandle(
    ref,
    (): MapViewHandle => ({
      flyTo,
      focus: (target, bottomPadding) => {
        const map = mapRef.current
        if (!map) return
        // On ne bouge la carte que si le point est masqué par l'en-tête, la feuille
        // de résultats ou hors écran : recentrer sans raison est désagréable.
        const { x, y } = map.project([target.lon, target.lat])
        const canvas = map.getCanvas()
        const visible =
          x > 24 &&
          x < canvas.clientWidth - 24 &&
          y > 150 &&
          y < canvas.clientHeight - bottomPadding
        if (visible) return
        map.easeTo({
          center: [target.lon, target.lat],
          offset: [0, -bottomPadding / 3],
          duration: 600,
        })
      },
    }),
    [flyTo],
  )

  return (
    <div className="absolute inset-0">
      <div ref={container} className="size-full" />
      {styleError && (
        <p className="absolute inset-x-3 top-1/2 rounded-xl bg-white/95 p-3 text-center text-sm text-muted shadow-float">
          Le fond de carte IGN est momentanément indisponible.
        </p>
      )}
    </div>
  )
}
