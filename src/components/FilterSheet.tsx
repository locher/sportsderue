import type { Filters } from '../types'
import {
  ALL_CATEGORY_IDS,
  CATEGORIES,
  DEFAULT_CATEGORY_IDS,
  type CategoryId,
} from '../lib/sports'
import { BottomSheet } from './BottomSheet'
import { AccessibleIcon, BulbIcon, TreeIcon } from './Icons'

interface Props {
  open: boolean
  filters: Filters
  resultCount: number
  onChange: (filters: Filters) => void
  onClose: () => void
}

const GROUPS: { id: 'urbain' | 'nature'; title: string; hint: string }[] = [
  {
    id: 'urbain',
    title: 'En ville, au pied de chez soi',
    hint: 'Équipements de proximité, praticables sans réservation.',
  },
  {
    id: 'nature',
    title: 'Nature et plein air',
    hint: 'Boucles de randonnée, sites d’escalade, baignades aménagées…',
  },
]

export function FilterSheet({ open, filters, resultCount, onChange, onClose }: Props) {
  const toggleCategory = (id: CategoryId) => {
    const active = filters.categories.includes(id)
    onChange({
      ...filters,
      categories: active
        ? filters.categories.filter((c) => c !== id)
        : [...filters.categories, id],
    })
  }

  const setGroup = (group: 'urbain' | 'nature', on: boolean) => {
    const ids = CATEGORIES.filter((c) => c.group === group).map((c) => c.id)
    onChange({
      ...filters,
      categories: on
        ? [...new Set([...filters.categories, ...ids])]
        : filters.categories.filter((c) => !ids.includes(c)),
    })
  }

  const options = [
    {
      key: 'outdoorOnly' as const,
      label: 'Plein air uniquement',
      hint: 'Exclut les équipements en salle',
      icon: <TreeIcon />,
    },
    {
      key: 'litOnly' as const,
      label: 'Éclairé',
      hint: 'Praticable en soirée',
      icon: <BulbIcon />,
    },
    {
      key: 'accessibleOnly' as const,
      label: 'Accessible PMR',
      hint: 'Accès à l’aire de pratique déclaré accessible',
      icon: <AccessibleIcon />,
    },
  ]

  return (
    <BottomSheet
      open={open}
      title="Filtres"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onChange({
                categories: DEFAULT_CATEGORY_IDS,
                outdoorOnly: false,
                litOnly: false,
                accessibleOnly: false,
              })
            }
            className="rounded-full px-4 py-3 text-sm font-medium text-muted active:bg-canvas"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-brand px-4 py-3 font-semibold text-white active:bg-brand-dark"
          >
            Voir {resultCount > 0 ? `les ${resultCount} équipements` : 'la carte'}
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {GROUPS.map((group) => {
          const categories = CATEGORIES.filter((c) => c.group === group.id)
          const allOn = categories.every((c) => filters.categories.includes(c.id))
          return (
            <section key={group.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-wide text-ink uppercase">
                  {group.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setGroup(group.id, !allOn)}
                  className="shrink-0 text-sm font-medium text-brand"
                >
                  {allOn ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>
              <p className="mb-3 text-sm text-muted">{group.hint}</p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => {
                  const active = filters.categories.includes(category.id)
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleCategory(category.id)}
                      className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-medium transition-colors ${
                        active
                          ? 'border-brand bg-brand-light text-brand-dark'
                          : 'border-line bg-white text-ink'
                      }`}
                    >
                      <span aria-hidden="true" className="text-lg leading-none">
                        {category.emoji}
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">{category.label}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}

        <section>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-ink uppercase">
            Caractéristiques
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {options.map((option) => (
              <li key={option.key}>
                <label className="flex cursor-pointer items-center gap-3 bg-white p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-muted">
                    {option.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-sm text-muted">{option.hint}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={filters[option.key]}
                    onChange={(event) =>
                      onChange({ ...filters, [option.key]: event.target.checked })
                    }
                    className="size-5 shrink-0 accent-brand"
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs leading-relaxed text-muted">
          {filters.categories.length} catégorie{filters.categories.length > 1 ? 's' : ''} sur{' '}
          {ALL_CATEGORY_IDS.length} sélectionnée{filters.categories.length > 1 ? 's' : ''}. Les
          caractéristiques proviennent des déclarations des propriétaires : elles peuvent être
          incomplètes.
        </p>
      </div>
    </BottomSheet>
  )
}
