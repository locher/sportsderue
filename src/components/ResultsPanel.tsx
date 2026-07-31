import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Equipment } from '../types'
import { categoryStyle } from '../lib/sports'
import { formatDistance } from '../lib/geo'
import { useViewportHeight } from '../hooks/useViewportHeight'
import { AccessibleIcon, BulbIcon, ChevronIcon, Spinner } from './Icons'

const PEEK_HEIGHT = 108

interface Props {
  items: Equipment[]
  loading: boolean
  error: string | null
  truncated: boolean
  total: number | null
  zoomedOut: boolean
  areaLabel: string
  selectedId: string | null
  onSelect: (id: string) => void
  onRetry: () => void
  onEnableNature: () => void
  onResetFilters: () => void
  onHeightChange: (height: number) => void
}

/** Feuille de résultats persistante, à trois positions : aperçu, moitié, plein écran. */
export function ResultsPanel({
  items,
  loading,
  error,
  truncated,
  total,
  zoomedOut,
  areaLabel,
  selectedId,
  onSelect,
  onRetry,
  onEnableNature,
  onResetFilters,
  onHeightChange,
}: Props) {
  const viewportHeight = useViewportHeight()
  const snapHeights = useMemo(
    () => [PEEK_HEIGHT, Math.round(viewportHeight * 0.46), Math.round(viewportHeight * 0.88)],
    [viewportHeight],
  )
  const [snap, setSnap] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startSnap: number; delta: number } | null>(null)

  const panelHeight = snapHeights[2]
  const restingOffset = panelHeight - snapHeights[snap]

  useEffect(() => {
    onHeightChange(snapHeights[snap])
  }, [snap, snapHeights, onHeightChange])

  // Une nouvelle recherche ramène la liste en haut.
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0
  }, [areaLabel])

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { startY: event.clientY, startSnap: snap, delta: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || !panel.current) return
    const delta = event.clientY - drag.current.startY
    drag.current.delta = delta
    const base = panelHeight - snapHeights[drag.current.startSnap]
    const next = Math.max(0, Math.min(panelHeight - PEEK_HEIGHT, base + delta))
    panel.current.style.transition = 'none'
    panel.current.style.transform = `translateY(${next}px)`
  }

  const onPointerUp = () => {
    if (!drag.current || !panel.current) return
    const { delta, startSnap } = drag.current
    drag.current = null

    // Un geste franc (> 40 px) fait changer de position ; sinon on reste où l'on est.
    let next = startSnap
    if (delta < -40) next = Math.min(2, startSnap + 1)
    else if (delta > 40) next = Math.max(0, startSnap - 1)

    // On repose la feuille sur sa position d'arrivée en écrivant exactement la même
    // valeur que celle du rendu React : sans cela, un `snap` inchangé ne déclenche pas
    // de rendu et le style en ligne posé pendant le geste resterait en place.
    panel.current.style.transition = ''
    panel.current.style.transform = `translateY(${panelHeight - snapHeights[next]}px)`
    setSnap(next)
  }

  const expand = useCallback(() => setSnap((s) => (s === 0 ? 1 : s)), [])

  const count = items.length
  const heading = zoomedOut
    ? 'Zoomez pour découvrir les équipements'
    : count === 0
      ? 'Aucun équipement ici'
      : `${count}${truncated ? '+' : ''} équipement${count > 1 ? 's' : ''}`

  return (
    <section
      ref={panel}
      aria-label="Liste des équipements"
      style={{ height: panelHeight, transform: `translateY(${restingOffset}px)` }}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-white shadow-sheet transition-transform duration-300 ease-out"
    >
      <div
        className="shrink-0 cursor-grab touch-none pt-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
        <button
          type="button"
          onClick={() => setSnap((s) => (s === 0 ? 1 : 0))}
          aria-expanded={snap > 0}
          className="flex w-full items-center gap-3 px-4 pt-2.5 pb-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-base font-semibold">
              {heading}
              {loading && <Spinner className="size-4 animate-spin text-brand" />}
            </span>
            <span className="mt-0.5 block truncate text-sm text-muted">{areaLabel}</span>
          </span>
          <ChevronIcon
            className={`size-5 shrink-0 text-muted transition-transform ${
              snap > 0 ? '-rotate-90' : 'rotate-90'
            }`}
          />
        </button>
      </div>

      <div
        ref={list}
        className={`min-h-0 flex-1 overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${
          snap === 0 ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {error && (
          <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-800">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-full bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
            >
              Réessayer
            </button>
          </div>
        )}

        {!error && zoomedOut && (
          <p className="px-1 py-2 text-sm leading-relaxed text-muted">
            La carte couvre une zone trop large. Zoomez sur une commune ou lancez une recherche
            pour charger les équipements.
          </p>
        )}

        {!error && !zoomedOut && count === 0 && !loading && (
          <div className="space-y-3 px-1 py-2 text-sm leading-relaxed text-muted">
            <p>
              Aucun équipement en accès libre déclaré dans cette zone. Élargissez la vue, ou
              ajustez les sports recherchés.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onEnableNature}
                className="rounded-full border border-line px-3 py-2 font-medium text-ink"
              >
                🥾 Ajouter nature & plein air
              </button>
              <button
                type="button"
                onClick={onResetFilters}
                className="rounded-full border border-line px-3 py-2 font-medium text-ink"
              >
                Réinitialiser les filtres
              </button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <EquipmentRow
                item={item}
                selected={item.id === selectedId}
                onClick={() => {
                  expand()
                  onSelect(item.id)
                }}
              />
            </li>
          ))}
        </ul>

        {truncated && count > 0 && (
          <p className="px-1 py-3 text-xs leading-relaxed text-muted">
            {total
              ? `${count} équipements affichés sur ${total} dans cette zone.`
              : `Seuls les ${count} premiers équipements de la zone sont affichés.`}{' '}
            Zoomez pour tous les voir.
          </p>
        )}
      </div>
    </section>
  )
}

function EquipmentRow({
  item,
  selected,
  onClick,
}: {
  item: Equipment
  selected: boolean
  onClick: () => void
}) {
  const category = categoryStyle(item.category)
  const place = [item.city, item.postcode].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors ${
        selected ? 'bg-brand-light' : 'active:bg-canvas'
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full text-xl"
        style={{ backgroundColor: `${category.color}1a` }}
      >
        {category.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="block truncate text-sm text-muted">
          {item.type}
          {place ? ` · ${place}` : ''}
        </span>
        {(item.lit || item.accessible) && (
          <span className="mt-1 flex items-center gap-2.5 text-xs text-muted">
            {item.lit && (
              <span className="flex items-center gap-1">
                <BulbIcon className="size-3.5" /> Éclairé
              </span>
            )}
            {item.accessible && (
              <span className="flex items-center gap-1">
                <AccessibleIcon className="size-3.5" /> PMR
              </span>
            )}
          </span>
        )}
      </span>
      {item.distance !== undefined && (
        <span className="shrink-0 text-sm font-semibold text-brand tabular-nums">
          {formatDistance(item.distance)}
        </span>
      )}
    </button>
  )
}
