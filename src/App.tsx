import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Bbox, Equipment, Filters, LngLat, MapPosition, Place } from './types'
import { MapView, type MapViewHandle } from './components/MapView'
import { SearchPanel } from './components/SearchPanel'
import { SportChips } from './components/SportChips'
import { FilterSheet } from './components/FilterSheet'
import { ResultsPanel } from './components/ResultsPanel'
import { EquipmentSheet } from './components/EquipmentSheet'
import { AboutSheet } from './components/AboutSheet'
import { FilterIcon, InfoIcon, LocateIcon, SearchIcon, Spinner } from './components/Icons'
import { useGeolocation } from './hooks/useGeolocation'
import { MIN_ZOOM_FOR_DATA, useEquipments } from './hooks/useEquipments'
import { useViewportHeight } from './hooks/useViewportHeight'
import { FRANCE_CENTER, FRANCE_ZOOM, distanceMeters } from './lib/geo'
import { reverseCity, zoomForPlace } from './lib/geocode'
import { CATEGORIES, DEFAULT_CATEGORY_IDS } from './lib/sports'
import {
  DEFAULT_FILTERS,
  loadStoredFilters,
  readState,
  storeFilters,
  writeState,
} from './lib/urlState'
import { fetchEquipmentDetail } from './lib/dataes'
import { fetchPlaygroundDetail, isPlaygroundId } from './lib/overpass'

const NATURE_IDS = CATEGORIES.filter((c) => c.group === 'nature').map((c) => c.id)

function initialFilters(): Filters {
  const params = new URLSearchParams(window.location.search)
  if (params.has('s') || params.has('f')) return readState().filters
  return loadStoredFilters() ?? DEFAULT_FILTERS
}

function activeFilterCount(filters: Filters): number {
  const defaults = new Set<string>(DEFAULT_CATEGORY_IDS)
  const changedCategories =
    filters.categories.length !== defaults.size ||
    filters.categories.some((c) => !defaults.has(c))
  return (
    (changedCategories ? 1 : 0) +
    (filters.outdoorOnly ? 1 : 0) +
    (filters.litOnly ? 1 : 0) +
    (filters.accessibleOnly ? 1 : 0)
  )
}

export default function App() {
  const boot = useRef(readState())
  const map = useRef<MapViewHandle>(null)

  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [view, setView] = useState<{ position: MapPosition; bbox: Bbox } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(boot.current.selectedId)
  const [linkedEquipment, setLinkedEquipment] = useState<Equipment | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(108)
  const [searchLabel, setSearchLabel] = useState<string | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)
  const [followUser, setFollowUser] = useState(boot.current.position === null)

  const geo = useGeolocation()
  const viewportHeight = useViewportHeight()

  const initialPosition: MapPosition = useMemo(
    () => boot.current.position ?? { ...FRANCE_CENTER, zoom: FRANCE_ZOOM },
    [],
  )

  // Les distances sont comptées depuis la position GPS tant qu'on explore la même
  // région ; au-delà (recherche d'une autre ville), depuis le centre de la carte.
  const origin: LngLat | null = useMemo(() => {
    const center = view ? { lon: view.position.lon, lat: view.position.lat } : null
    if (!geo.position) return center
    const me = { lon: geo.position.lon, lat: geo.position.lat }
    if (!center) return me
    return distanceMeters(me, center) < 30_000 ? me : center
  }, [geo.position, view])

  const equipments = useEquipments({
    bbox: view?.bbox ?? null,
    zoom: view?.position.zoom ?? FRANCE_ZOOM,
    filters,
    origin,
  })

  const onViewChange = useCallback((position: MapPosition, bbox: Bbox) => {
    setView({ position, bbox })
  }, [])

  // Première visite sans position dans l'URL : on demande la géolocalisation.
  const askedForLocation = useRef(false)
  useEffect(() => {
    if (askedForLocation.current || boot.current.position) return
    askedForLocation.current = true
    void geo.locate().then((position) => {
      if (!position) return
      setSearchLabel(null)
      map.current?.flyTo({ lon: position.lon, lat: position.lat, zoom: 13.6 })
    })
  }, [geo])

  // Mémorisation des filtres + synchronisation de l'URL.
  useEffect(() => {
    storeFilters(filters)
  }, [filters])

  useEffect(() => {
    document.documentElement.style.setProperty('--sheet-h', `${sheetHeight}px`)
  }, [sheetHeight])

  useEffect(() => {
    writeState({ position: view?.position ?? null, filters, selectedId })
  }, [view?.position, filters, selectedId])

  // Nom de la commune sous le centre de la carte, pour situer la liste.
  useEffect(() => {
    if (!view || view.position.zoom < MIN_ZOOM_FOR_DATA) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void reverseCity(view.position.lon, view.position.lat, controller.signal).then((city) => {
        if (city) setCityLabel(city)
      })
    }, 800)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // Les clés arrondies évitent un appel à chaque micro-déplacement.
  }, [view?.position.lon.toFixed(2), view?.position.lat.toFixed(2)])

  // Lien partagé vers un équipement précis : on charge sa fiche et on s'y rend.
  useEffect(() => {
    const id = boot.current.selectedId
    if (!id) return
    const controller = new AbortController()
    // Le préfixe de l'identifiant dit à quelle base s'adresser.
    const load = isPlaygroundId(id)
      ? fetchPlaygroundDetail(id, controller.signal)
      : fetchEquipmentDetail(id, controller.signal)
    void load
      .then((detail) => {
        if (!detail) return
        setLinkedEquipment(detail)
        if (!boot.current.position) {
          map.current?.flyTo({ lon: detail.lon, lat: detail.lat, zoom: 16 })
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return (
      equipments.items.find((item) => item.id === selectedId) ??
      (linkedEquipment?.id === selectedId ? linkedEquipment : null)
    )
  }, [selectedId, equipments.items, linkedEquipment])

  const onSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (!id) return
      const item = equipments.items.find((entry) => entry.id === id)
      if (item) map.current?.focus(item, Math.min(viewportHeight * 0.6, 420))
    },
    [equipments.items, viewportHeight],
  )

  const locateMe = useCallback(() => {
    setFollowUser(true)
    setSearchLabel(null)
    void geo.locate().then((position) => {
      if (position) map.current?.flyTo({ lon: position.lon, lat: position.lat, zoom: 13.6 })
    })
  }, [geo])

  const pickPlace = useCallback((place: Place) => {
    setSearchOpen(false)
    setFollowUser(false)
    setSearchLabel(place.label)
    setCityLabel(null)
    setSelectedId(null)
    map.current?.flyTo({ lon: place.lon, lat: place.lat, zoom: zoomForPlace(place) })
  }, [])

  const filterCount = activeFilterCount(filters)
  const areaLabel = searchLabel
    ? searchLabel
    : followUser && geo.position
      ? 'Autour de vous'
      : cityLabel
        ? `Autour de ${cityLabel}`
        : 'Zone affichée'

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-canvas">
      <MapView
        ref={map}
        initialPosition={initialPosition}
        items={equipments.items}
        selectedId={selectedId}
        userPosition={geo.position}
        onViewChange={onViewChange}
        onSelect={onSelect}
        onMoveStart={() => setFollowUser(false)}
      />

      {/* Voile dégradé : les commandes blanches restent lisibles sur une carte chargée. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-52 bg-gradient-to-b from-canvas/70 to-transparent"
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-auto flex items-center gap-2 px-3 pt-3 pb-3">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="springy glass flex min-w-0 flex-1 items-center gap-3 rounded-full py-2 pr-5 pl-2 text-left shadow-float"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-lime"
            >
              <SearchIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {searchLabel ? (
                <span className="block truncate font-bold text-ink">{searchLabel}</span>
              ) : (
                <span className="block truncate font-medium text-muted">Chercher un spot</span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtres${filterCount ? ` (${filterCount} actifs)` : ''}`}
            className="springy relative grid size-14 shrink-0 place-items-center rounded-full bg-ink text-white shadow-float"
          >
            <FilterIcon />
            {filterCount > 0 && (
              <span className="animate-pop absolute -top-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-lime text-xs font-extrabold text-ink ring-[3px] ring-white">
                {filterCount}
              </span>
            )}
          </button>
        </div>

        <div className="pointer-events-auto">
          <SportChips
            active={filters.categories}
            onChange={(categories) => setFilters((current) => ({ ...current, categories }))}
          />
        </div>

        {geo.message && (
          <div className="animate-rise pointer-events-auto mx-3 mt-2 rounded-[22px] bg-ink px-4 py-3 text-sm font-semibold text-white shadow-float">
            {geo.message}
            {geo.canRetry && (
              // La demande du démarrage part d'un effet, sans geste utilisateur :
              // cette tape en fournit un, seule façon de revoir la demande native.
              <button
                type="button"
                onClick={locateMe}
                className="springy mt-2.5 block rounded-full bg-lime px-4 py-2 text-sm font-extrabold text-ink"
              >
                Réessayer
              </button>
            )}
          </div>
        )}
      </header>

      <div
        className="absolute right-3 z-20 flex flex-col items-end gap-2.5 transition-[bottom] duration-400 ease-[var(--ease-glide)]"
        style={{ bottom: sheetHeight + 14 }}
      >
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          aria-label="À propos"
          className="springy glass grid size-11 place-items-center rounded-full text-muted shadow-float"
        >
          <InfoIcon />
        </button>
        <button
          type="button"
          onClick={locateMe}
          aria-label="Me localiser"
          aria-pressed={followUser}
          className={`springy relative grid size-14 place-items-center rounded-full text-ink shadow-float ${
            followUser && geo.position ? 'bg-lime' : 'glass'
          }`}
        >
          {/* Onde qui « respire » tant que la carte suit la position. */}
          {followUser && geo.position && (
            <span
              aria-hidden="true"
              className="animate-breathe absolute inset-0 rounded-full bg-lime"
            />
          )}
          <span className="relative">
            {geo.isLocating ? <Spinner className="size-5 animate-spin" /> : <LocateIcon />}
          </span>
        </button>
      </div>

      <ResultsPanel
        items={equipments.items}
        loading={equipments.loading}
        error={equipments.error}
        warning={equipments.warning}
        truncated={equipments.truncated}
        total={equipments.total}
        zoomedOut={equipments.zoomedOut}
        areaLabel={areaLabel}
        activeCategories={filters.categories}
        selectedId={selectedId}
        onSelect={onSelect}
        onRetry={equipments.reload}
        onEnableNature={() =>
          setFilters((current) => ({
            ...current,
            categories: [...new Set([...current.categories, ...NATURE_IDS])],
          }))
        }
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        onHeightChange={setSheetHeight}
      />

      <EquipmentSheet equipment={selected} onClose={() => setSelectedId(null)} />

      <FilterSheet
        open={filtersOpen}
        filters={filters}
        resultCount={equipments.items.length}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />

      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={pickPlace}
        onLocate={() => {
          setSearchOpen(false)
          locateMe()
        }}
        locating={geo.isLocating}
      />
    </main>
  )
}
