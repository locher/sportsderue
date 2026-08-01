import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  AttributionControl,
  MapLibreMap,
  Marker,
  setWorkerUrl,
  type DataDrivenPropertyValueSpecification,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl'
// MapLibre déduit l'adresse de son worker de sa propre URL, ce qu'un bundler casse :
// on la lui donne explicitement, à partir du worker construit par Vite.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { Bbox, Equipment, LngLat, MapPosition } from '../types'
import { CATEGORIES } from '../lib/sports'
import { MAP_LAND, MAP_STYLE_URL, loadMapStyle } from '../lib/mapTheme'
import type { UserPosition } from '../hooks/useGeolocation'

setWorkerUrl(maplibreWorkerUrl)

const SOURCE_ID = 'equipements'
const LAYER_PINS = 'equipements-pins'
const LAYER_CLUSTERS = 'equipements-clusters'
const LAYER_CLUSTER_COUNT = 'equipements-clusters-count'
const LAYER_CLUSTER_GLOW = 'equipements-clusters-glow'
const LAYER_HALO = 'equipements-halo'

const ATTRIBUTION = [
  '<a href="https://www.ign.fr/" target="_blank" rel="noreferrer">IGN</a>',
  '<a href="https://equipements.sports.gouv.fr/" target="_blank" rel="noreferrer">Data ES — ministère des Sports</a>',
  // Les aires de jeux viennent d'OpenStreetMap : l'ODbL impose de le mentionner.
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© les contributeurs OpenStreetMap</a>',
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

/**
 * Dessine une épingle : goutte pleine dans la couleur du sport, pastille blanche
 * portant l'emoji, liseré blanc pour la détacher du fond de carte.
 */
function pinImage(emoji: string, color: string, dpr: number): ImageData | null {
  const w = 40
  const h = 50
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)

  const cx = w / 2
  const cy = 18
  const r = 15
  const tip = h - 3

  // Contour de la goutte : disque + pointe tangente, tracés d'un seul trait.
  const spread = Math.asin(5.2 / r)
  const drop = new Path2D()
  drop.arc(cx, cy, r, Math.PI / 2 - spread, Math.PI / 2 + spread, true)
  drop.lineTo(cx, tip)
  drop.closePath()

  ctx.shadowColor = 'rgba(20, 26, 23, 0.34)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 2

  ctx.fillStyle = color
  ctx.fill(drop)

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.stroke(drop)

  // Pastille blanche : l'emoji garde ses couleurs sans se noyer dans le fond.
  ctx.beginPath()
  ctx.arc(cx, cy, 11.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.font =
    '15px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif'
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
    const image = pinImage(category.emoji, category.vivid, dpr)
    if (!image) continue
    map.addImage(
      id,
      { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer) },
      { pixelRatio: dpr },
    )
  }
}

/** `cat` → couleur vive du sport, pour teinter le halo de sélection. */
function categoryColorExpression(): DataDrivenPropertyValueSpecification<string> {
  const cases: unknown[] = ['match', ['get', 'cat']]
  for (const category of CATEGORIES) cases.push(category.id, category.vivid)
  cases.push('#141a17')
  return cases as DataDrivenPropertyValueSpecification<string>
}

/** Rayon d'un regroupement, croissant par paliers ; `extra` élargit la lueur. */
function clusterRadius(extra: number): DataDrivenPropertyValueSpecification<number> {
  return [
    'step',
    ['get', 'point_count'],
    18 + extra,
    10,
    22 + extra,
    50,
    27 + extra,
    200,
    33 + extra,
  ]
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
    <span class="absolute size-11 rounded-full bg-ink/15 animate-ping"></span>
    <span class="absolute size-7 rounded-full bg-lime/70"></span>
    <span class="size-4 rounded-full bg-ink ring-[3px] ring-white shadow-float"></span>`
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

  // Idem pour l'état : à chaque changement de style, les couches sont réinstallées
  // et doivent repartir des données courantes.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  useEffect(() => {
    if (!container.current || mapRef.current) return

    const map = new MapLibreMap({
      container: container.current,
      // Style provisoire : la terre à la bonne couleur, le temps que le style
      // thématisé soit chargé. Évite le flash blanc au démarrage.
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: 'fond-application', type: 'background', paint: { 'background-color': MAP_LAND } },
        ],
      },
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

    // Le style Plan IGN est recoloré dans la palette de l'application avant d'être
    // posé sur la carte ; si le retraitement échoue, on retombe sur le style brut.
    const styleAbort = new AbortController()
    void loadMapStyle(styleAbort.signal)
      .then((style) => {
        if (styleAbort.signal.aborted) return
        map.setStyle(style)
      })
      .catch((cause: unknown) => {
        if (styleAbort.signal.aborted) return
        console.warn('Thème de carte indisponible, style IGN brut utilisé.', cause)
        map.setStyle(MAP_STYLE_URL)
      })
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
    // plutôt que de laisser une carte vide. Le style provisoire ne compte pas : on
    // attend la source des tuiles Plan IGN.
    const styleWatchdog = window.setTimeout(() => {
      if (!map.getSource('plan_ign')) setStyleError(true)
    }, 12_000)

    /**
     * Pose les couches de l'application. Idempotent : `setStyle` repart d'une
     * feuille vierge, il faut donc pouvoir tout réinstaller à chaque style chargé.
     */
    const installLayers = () => {
      if (!map.style || map.getSource(SOURCE_ID)) return
      registerIcons(map)

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(itemsRef.current),
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 13,
      })

      // Auréole des regroupements : une lueur large sous le disque, qui donne du
      // relief et rattache visuellement le point au dégradé de l'application.
      map.addLayer({
        id: LAYER_CLUSTER_GLOW,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#d6fb4f',
          'circle-opacity': 0.55,
          'circle-radius': clusterRadius(7),
        },
      })

      map.addLayer({
        id: LAYER_HALO,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 22,
          'circle-color': categoryColorExpression() as never,
          'circle-opacity': 0.22,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': categoryColorExpression() as never,
          'circle-stroke-opacity': 0.7,
        },
      })

      map.addLayer({
        id: LAYER_CLUSTERS,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#141a17',
          'circle-radius': clusterRadius(0),
          'circle-stroke-width': 3,
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
          'text-size': 14,
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

      map.setFilter(LAYER_HALO, ['==', ['get', 'id'], selectedIdRef.current ?? ''])
      setReady(true)
      handlers.current.onViewChange(readPosition(map), readBbox(map))
    }

    map.on('styledata', () => {
      setStyleError(false)
      installLayers()
    })
    if (map.isStyleLoaded()) installLayers()

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
      styleAbort.abort()
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

  // Mise en évidence de l'équipement sélectionné : le halo « bat » doucement,
  // comme un cœur à l'effort, pour attirer l'œil sans masquer la carte.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter(LAYER_HALO, ['==', ['get', 'id'], selectedId ?? ''])
    if (!selectedId) return

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (calm) return

    let frame = 0
    const start = performance.now()
    const beat = (now: number) => {
      const phase = ((now - start) % 1900) / 1900
      const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2
      map.setPaintProperty(LAYER_HALO, 'circle-radius', 20 + wave * 12)
      map.setPaintProperty(LAYER_HALO, 'circle-opacity', 0.26 - wave * 0.14)
      map.setPaintProperty(LAYER_HALO, 'circle-stroke-opacity', 0.75 - wave * 0.45)
      frame = requestAnimationFrame(beat)
    }
    frame = requestAnimationFrame(beat)
    return () => cancelAnimationFrame(frame)
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
        <p className="animate-rise glass absolute inset-x-4 top-1/2 rounded-3xl p-4 text-center text-sm font-medium text-muted shadow-float">
          Le fond de carte IGN est momentanément indisponible.
        </p>
      )}
    </div>
  )
}
