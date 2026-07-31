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
        className="flex items-center gap-2 border-b border-line px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (results[0]) onPick(results[0])
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted active:bg-canvas"
        >
          <CloseIcon />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-canvas px-3.5 py-2.5">
          <SearchIcon className="size-5 shrink-0 text-muted" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Ville, quartier, adresse…"
            aria-label="Ville, quartier ou adresse"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          {loading && <Spinner className="size-4 shrink-0 animate-spin text-muted" />}
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={onLocate}
          className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left active:bg-canvas"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-light text-brand">
            {locating ? <Spinner className="size-4 animate-spin" /> : <LocateIcon />}
          </span>
          <span className="font-medium">Autour de moi</span>
        </button>

        {error && <p className="px-4 py-4 text-sm text-red-700">{error}</p>}

        {!error && query.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">Aucun lieu trouvé pour « {query} ».</p>
        )}

        <ul>
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onPick(place)}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left active:bg-canvas"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-muted">
                  <PinIcon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{place.label}</span>
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
          <p className="px-4 py-6 text-sm leading-relaxed text-muted">
            Cherchez une commune pour explorer ses équipements sportifs en accès libre, ou
            utilisez votre position.
          </p>
        )}
      </div>
    </div>
  )
}
