import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Equipment } from '../types'
import { categoryStyle, practicableMatches, readableOn, type CategoryId } from '../lib/sports'
import { formatDistance } from '../lib/geo'
import { sameLabel } from '../lib/text'
import { useViewportHeight } from '../hooks/useViewportHeight'
import { AccessibleIcon, BulbIcon, ChevronIcon } from './Icons'

/** Repli de départ, remplacé par la hauteur réelle de l'en-tête dès la mesure. */
const PEEK_FALLBACK = 124

interface Props {
  items: Equipment[]
  loading: boolean
  error: string | null
  /** Panne d'une source secondaire : signalée sans masquer les résultats obtenus. */
  warning: string | null
  truncated: boolean
  total: number | null
  zoomedOut: boolean
  areaLabel: string
  /** Catégories cochées, pour expliquer les résultats trouvés via une activité. */
  activeCategories: CategoryId[]
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
  warning,
  truncated,
  total,
  zoomedOut,
  areaLabel,
  activeCategories,
  selectedId,
  onSelect,
  onRetry,
  onEnableNature,
  onResetFilters,
  onHeightChange,
}: Props) {
  const viewportHeight = useViewportHeight()
  const [peekHeight, setPeekHeight] = useState(PEEK_FALLBACK)
  const snapHeights = useMemo(
    () => [peekHeight, Math.round(viewportHeight * 0.46), Math.round(viewportHeight * 0.88)],
    [peekHeight, viewportHeight],
  )
  const [snap, setSnap] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startSnap: number; delta: number } | null>(null)

  // En position d'aperçu, la feuille s'arrête exactement au bas de son en-tête :
  // pas de carte tronquée en bord de feuille, quelle que soit la taille du texte.
  useEffect(() => {
    const node = header.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setPeekHeight(Math.round(entry.contentRect.height))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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
    const next = Math.max(0, Math.min(panelHeight - peekHeight, base + delta))
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
  // Titre court : il doit tenir sur une ligne, l'en-tête sert de repli d'aperçu.
  const headline = zoomedOut
    ? 'Zoomez un peu'
    : count === 0
      ? 'Rien à jouer ici'
      : `${count}${truncated ? '+' : ''} spot${count > 1 ? 's' : ''}`

  return (
    <section
      ref={panel}
      aria-label="Liste des équipements"
      style={{ height: panelHeight, transform: `translateY(${restingOffset}px)` }}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[40px] bg-white shadow-sheet transition-transform duration-400 ease-[var(--ease-spring)]"
    >
      <div
        ref={header}
        className="relative shrink-0 cursor-grab touch-none pt-3 active:cursor-grabbing"
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
          className="flex w-full items-end gap-3 px-5 pt-3.5 pb-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="eyebrow block truncate text-muted">{areaLabel}</span>
            <span className="display mt-2 block text-[30px] leading-none tabular-nums">
              {headline}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink"
          >
            <ChevronIcon
              className={`size-5 transition-transform duration-400 ease-[var(--ease-spring)] ${
                snap > 0 ? '-rotate-90' : 'rotate-90'
              }`}
            />
          </span>
        </button>

        {/* Barre de chargement : un coureur qui traverse la piste. */}
        {loading && (
          <div className="mx-5 h-[3px] overflow-hidden rounded-full bg-line">
            <div className="animate-sheen h-full w-1/3 rounded-full bg-lime-deep" />
          </div>
        )}
      </div>

      <div
        ref={list}
        className={`relative min-h-0 flex-1 overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${
          snap === 0 ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {error && (
          <div className="rounded-[26px] bg-flame/10 p-4 text-sm text-ink">
            <p className="leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="springy mt-3 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white"
            >
              Réessayer
            </button>
          </div>
        )}

        {!error && warning && (
          <p className="animate-rise mb-2 rounded-[26px] bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
            {warning}
          </p>
        )}

        {!error && zoomedOut && (
          <EmptyState
            emoji="🔍"
            title="La carte voit trop large"
            text="Zoomez sur une commune, ou lancez une recherche : les spots apparaissent dès que la vue se resserre."
          />
        )}

        {!error && !zoomedOut && count === 0 && !loading && (
          <EmptyState
            emoji="🤷"
            title="Aucun spot déclaré ici"
            text="Élargissez la vue ou ouvrez la sélection à d’autres sports."
          >
            <button
              type="button"
              onClick={onEnableNature}
              className="springy rounded-full bg-lime px-4 py-3 text-sm font-extrabold text-ink"
            >
              🥾 Ajouter nature & plein air
            </button>
            <button
              type="button"
              onClick={onResetFilters}
              className="springy rounded-full bg-canvas px-4 py-3 text-sm font-bold text-ink"
            >
              Tout réinitialiser
            </button>
          </EmptyState>
        )}

        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="animate-rise"
              // Cascade courte : les premières cartes arrivent l'une après l'autre.
              style={{ animationDelay: `${Math.min(index, 9) * 35}ms` }}
            >
              <EquipmentRow
                item={item}
                activeCategories={activeCategories}
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
          <p className="px-1 py-4 text-xs leading-relaxed text-muted">
            {total
              ? `${count} spots affichés sur ${total} dans cette zone.`
              : `Seuls les ${count} premiers spots de la zone sont affichés.`}{' '}
            Zoomez pour tous les voir.
          </p>
        )}
      </div>
    </section>
  )
}

function EmptyState({
  emoji,
  title,
  text,
  children,
}: {
  emoji: string
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="animate-rise flex flex-col items-center px-4 py-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-24 place-items-center rounded-[34px] bg-lime text-5xl"
      >
        {emoji}
      </span>
      <h3 className="display mt-5 text-2xl">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{text}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

function EquipmentRow({
  item,
  activeCategories,
  selected,
  onClick,
}: {
  item: Equipment
  activeCategories: CategoryId[]
  selected: boolean
  onClick: () => void
}) {
  const category = categoryStyle(item.category)
  const place = [item.city, item.postcode].filter(Boolean).join(' · ')
  // Une aire de jeux sans nom porte son type comme titre : le redire juste en dessous
  // ferait deux fois la même ligne. On garde alors la commune seule, s'il y en a une.
  const subtitle = [sameLabel(item.type, item.name) ? '' : item.type, place]
    .filter(Boolean)
    .join(' · ')

  // Un city-stade remonté par le filtre « Basket » n'est pas un terrain de basket : on
  // dit pourquoi il est là. Inutile si sa propre catégorie est cochée — sa présence va
  // alors de soi.
  const practicable = activeCategories.includes(item.category)
    ? []
    : practicableMatches(item, activeCategories).slice(0, 3)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`springy flex w-full items-center gap-3 rounded-[26px] p-3 text-left ${
        selected ? 'bg-lime' : 'bg-canvas'
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-13 shrink-0 place-items-center rounded-[19px] text-[22px]"
        style={{ backgroundColor: category.vivid }}
      >
        {category.emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{item.name}</span>
        {subtitle && (
          <span
            className={`block truncate text-[13px] ${selected ? 'text-ink/70' : 'text-muted'}`}
          >
            {subtitle}
          </span>
        )}
        {practicable.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {practicable.map((match) => (
              <span
                key={match.id}
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: match.vivid,
                  color: readableOn(match.vivid),
                }}
              >
                <span aria-hidden="true">{match.emoji}</span> {match.short} praticable
              </span>
            ))}
          </span>
        )}
        {(item.lit || item.accessible) && (
          <span className="mt-1.5 flex items-center gap-1.5">
            {item.lit && (
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  selected ? 'bg-ink/10 text-ink' : 'bg-white text-muted'
                }`}
              >
                <BulbIcon className="size-3" /> Éclairé
              </span>
            )}
            {item.accessible && (
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  selected ? 'bg-ink/10 text-ink' : 'bg-white text-muted'
                }`}
              >
                <AccessibleIcon className="size-3" /> PMR
              </span>
            )}
          </span>
        )}
      </span>

      {item.distance !== undefined && (
        <span className="shrink-0 rounded-full bg-ink px-3 py-2 text-[13px] font-extrabold text-white tabular-nums">
          {formatDistance(item.distance)}
        </span>
      )}
    </button>
  )
}
