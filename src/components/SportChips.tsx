import { CATEGORIES, DEFAULT_CATEGORY_IDS, readableOn, type CategoryId } from '../lib/sports'

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
 *
 * Une puce active passe en encre sombre, cerclée et auréolée de la couleur du sport :
 * la sélection se lit d'un coup d'œil, même par-dessus une carte chargée.
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
    <div className="scroll-x flex gap-2 px-3 pb-2" role="group" aria-label="Filtrer par sport">
      <button
        type="button"
        aria-pressed={isDefault}
        onClick={() => onChange(DEFAULT_CATEGORY_IDS)}
        className={`springy shrink-0 self-center rounded-full px-4 py-2.5 text-sm font-extrabold whitespace-nowrap shadow-card ${
          isDefault ? 'bg-lime text-ink' : 'glass text-ink'
        }`}
      >
        Tous
      </button>

      {CATEGORIES.map((category) => {
        const isActive = !isDefault && active.includes(category.id)
        const onColor = readableOn(category.vivid)
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => toggle(category.id)}
            title={category.label}
            className={`springy flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-bold whitespace-nowrap shadow-card ${
              isActive ? '' : 'glass text-ink'
            }`}
            style={
              isActive ? { backgroundColor: category.vivid, color: onColor } : undefined
            }
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full text-base leading-none"
              style={{
                backgroundColor: isActive
                  ? onColor === '#ffffff'
                    ? 'rgb(255 255 255 / 0.24)'
                    : 'rgb(255 255 255 / 0.5)'
                  : `${category.color}1f`,
              }}
            >
              {category.emoji}
            </span>
            {category.short}
          </button>
        )
      })}
    </div>
  )
}
