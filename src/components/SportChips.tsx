import { CATEGORIES, DEFAULT_CATEGORY_IDS, readableOn, type CategoryId } from '../lib/sports'
import { track } from '../lib/audience'

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
    // Une seule chose est mesurée ici : la catégorie que la tape vient d'allumer ou
    // d'éteindre. C'est la répartition de cet événement par `sport` qui dit quels
    // filtres servent — et, par leur absence, lesquels ne servent jamais. Les gestes en
    // bloc (« Tous », les groupes, la réinitialisation) sont comptés à part pour ne pas
    // gonfler ce décompte de dix-huit d'un coup.
    if (isDefault) {
      track('filtre_sport', { sport: id, actif: true, source: 'puces' })
      onChange([id])
      return
    }
    const isActive = active.includes(id)
    track('filtre_sport', { sport: id, actif: !isActive, source: 'puces' })
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
        onClick={() => {
          track('filtre_tous', { source: 'puces' })
          onChange(DEFAULT_CATEGORY_IDS)
        }}
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
