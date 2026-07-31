import { CATEGORIES, DEFAULT_CATEGORY_IDS, type CategoryId } from '../lib/sports'

interface Props {
  active: CategoryId[]
  onChange: (categories: CategoryId[]) => void
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v))
}

/**
 * Puces de filtre rapide. Le geste attendu sur mobile : une tape isole un sport,
 * une seconde tape revient à la sélection par défaut.
 */
export function SportChips({ active, onChange }: Props) {
  const isDefault = sameSet(active, DEFAULT_CATEGORY_IDS)

  const toggle = (id: CategoryId) => {
    if (isDefault) {
      onChange([id])
      return
    }
    const isActive = active.includes(id)
    if (isActive && active.length === 1) {
      onChange(DEFAULT_CATEGORY_IDS)
      return
    }
    onChange(isActive ? active.filter((c) => c !== id) : [...active, id])
  }

  return (
    <div
      className="scroll-x flex gap-2 px-3 pb-1"
      role="group"
      aria-label="Filtrer par sport"
    >
      <button
        type="button"
        aria-pressed={isDefault}
        onClick={() => onChange(DEFAULT_CATEGORY_IDS)}
        className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap shadow-card transition-colors ${
          isDefault
            ? 'border-brand bg-brand text-white'
            : 'border-line bg-white text-ink active:bg-canvas'
        }`}
      >
        Tous
      </button>

      {CATEGORIES.map((category) => {
        const isActive = !isDefault && active.includes(category.id)
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => toggle(category.id)}
            title={category.label}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium whitespace-nowrap shadow-card transition-colors ${
              isActive
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-white text-ink active:bg-canvas'
            }`}
          >
            <span aria-hidden="true">{category.emoji}</span>
            {category.short}
          </button>
        )
      })}
    </div>
  )
}
