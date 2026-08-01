import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geocode'
import type { Place } from '../types'
import { CloseIcon, LocateIcon, PinIcon, SearchIcon, Spinner } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (place: Place) => void
  onLocate: () => void
  locating: boolean
}

const KIND_LABEL: Record<Place['kind'], string> = {
  municipality: 'Commune',
  locality: 'Lieu-dit',
  street: 'Rue',
  housenumber: 'Adresse',
  other: 'Lieu',
}

/** Recherche plein écran : villes, quartiers et adresses (Base Adresse Nationale). */
export function SearchPanel({ open, onClose, onPick, onLocate, locating }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // Léger différé : sur iOS le focus immédiat pendant l'animation est ignoré.
      const timer = window.setTimeout(() => input.current?.focus(), 60)
      return () => window.clearTimeout(timer)
    }
    setQuery('')
    setResults([])
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((places) => {
          setResults(places)
          setError(null)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError('Recherche indisponible pour le moment.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white pt-[env(safe-area-inset-top)]"
      role="dialog"
      aria-modal="true"
      aria-label="Rechercher un lieu"
    >
      <form
        className="flex items-center gap-2 px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (results[0]) onPick(results[0])
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="springy grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-ink"
        >
          <CloseIcon />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-canvas px-4 py-3">
          <SearchIcon className="size-5 shrink-0 text-ink" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Ville, quartier, adresse…"
            aria-label="Ville, quartier ou adresse"
            className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:font-normal placeholder:text-muted"
          />
          {loading && <Spinner className="size-4 shrink-0 animate-spin text-muted" />}
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onLocate}
          className="springy flex w-full items-center gap-3 rounded-[26px] bg-lime p-3 text-left text-ink"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-[17px] bg-ink text-lime">
            {locating ? <Spinner className="size-5 animate-spin" /> : <LocateIcon />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="display block text-lg">Autour de moi</span>
            <span className="block text-sm font-medium text-ink/70">
              Les spots les plus proches, tout de suite
            </span>
          </span>
        </button>

        {error && (
          <p className="mt-3 rounded-2xl bg-flame/10 px-4 py-3 text-sm font-medium">{error}</p>
        )}

        {!error && query.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted">
            Aucun lieu trouvé pour « {query} ».
          </p>
        )}

        <ul className="mt-2 space-y-0.5">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onPick(place)}
                className="flex w-full items-center gap-3 rounded-[18px] p-2.5 text-left transition-colors active:bg-canvas"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-ink">
                  <PinIcon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{place.label}</span>
                  <span className="block truncate text-sm text-muted">
                    {KIND_LABEL[place.kind]}
                    {place.context ? ` · ${place.context}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {query.trim().length < 2 && (
          <p className="px-2 py-8 text-center text-sm leading-relaxed text-muted">
            Cherchez une commune pour découvrir ses city-stades, skateparks et autres terrains
            en accès libre.
          </p>
        )}
      </div>
    </div>
  )
}
