import type { Filters } from '../types'
import {
  ALL_CATEGORY_IDS,
  CATEGORIES,
  DEFAULT_CATEGORY_IDS,
  readableOn,
  type CategoryId,
} from '../lib/sports'
import { BottomSheet } from './BottomSheet'
import { track } from '../lib/audience'
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
    hint: 'Équipements de proximité, praticables sans réservation, et aires de jeux pour enfants.',
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
    track('filtre_sport', { sport: id, actif: !active, source: 'feuille' })
    onChange({
      ...filters,
      categories: active
        ? filters.categories.filter((c) => c !== id)
        : [...filters.categories, id],
    })
  }

  const setGroup = (group: 'urbain' | 'nature', on: boolean) => {
    const ids = CATEGORIES.filter((c) => c.group === group).map((c) => c.id)
    // Un geste, un événement : une tape sur « Tout cocher » n'est pas huit tapes sur
    // huit sports, et compter ainsi rendrait illisible la répartition par sport.
    track('filtre_groupe', { groupe: group, actif: on, source: 'feuille' })
    onChange({
      ...filters,
      categories: on
        ? [...new Set([...filters.categories, ...ids])]
        : filters.categories.filter((c) => !ids.includes(c)),
    })
  }

  // `flag` reprend le nom que la caractéristique porte déjà dans l'URL (`f=air,eclaire`)
  // plutôt que le nom du champ : un seul vocabulaire pour l'URL et pour la mesure.
  const options = [
    {
      key: 'outdoorOnly' as const,
      flag: 'air',
      label: 'Plein air uniquement',
      hint: 'Exclut les équipements en salle',
      icon: <TreeIcon />,
    },
    {
      key: 'litOnly' as const,
      flag: 'eclaire',
      label: 'Éclairé',
      hint: 'Praticable en soirée',
      icon: <BulbIcon />,
    },
    {
      key: 'accessibleOnly' as const,
      flag: 'pmr',
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              track('filtres_reinitialises', { source: 'feuille' })
              onChange({
                categories: DEFAULT_CATEGORY_IDS,
                outdoorOnly: false,
                litOnly: false,
                accessibleOnly: false,
              })
            }}
            className="springy rounded-full px-4 py-3.5 text-sm font-bold text-muted"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={onClose}
            className="springy flex-1 rounded-full bg-lime px-4 py-4 font-extrabold text-ink shadow-lift"
          >
            Voir {resultCount > 0 ? `les ${resultCount} spots` : 'la carte'}
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
                <h3 className="display text-lg">{group.title}</h3>
                <button
                  type="button"
                  onClick={() => setGroup(group.id, !allOn)}
                  className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-[13px] font-bold text-ink"
                >
                  {allOn ? 'Tout décocher' : 'Tout cocher'}
                </button>
              </div>
              <p className="mb-3 text-sm text-muted">{group.hint}</p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => {
                  const active = filters.categories.includes(category.id)
                  const onColor = readableOn(category.vivid)
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleCategory(category.id)}
                      className={`springy flex items-center gap-2.5 rounded-[22px] p-2.5 text-left text-sm font-bold ${
                        active ? '' : 'bg-canvas text-ink'
                      }`}
                      style={
                        active
                          ? { backgroundColor: category.vivid, color: onColor }
                          : undefined
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-[15px] text-lg leading-none"
                        style={{
                          backgroundColor: active
                            ? onColor === '#ffffff'
                              ? 'rgb(255 255 255 / 0.24)'
                              : 'rgb(255 255 255 / 0.5)'
                            : 'white',
                        }}
                      >
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
          <h3 className="display mb-3 text-lg">Caractéristiques</h3>
          <ul className="space-y-2">
            {options.map((option) => {
              const on = filters[option.key]
              return (
                <li key={option.key}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-[22px] p-3 transition-colors ${
                      on ? 'bg-lime' : 'bg-canvas'
                    }`}
                  >
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-[15px] transition-colors ${
                        on ? 'bg-ink text-lime' : 'bg-white text-muted'
                      }`}
                    >
                      {option.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{option.label}</span>
                      <span className="block text-sm text-muted">{option.hint}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(event) => {
                        track('filtre_caracteristique', {
                          caracteristique: option.flag,
                          actif: event.target.checked,
                        })
                        onChange({ ...filters, [option.key]: event.target.checked })
                      }}
                      className="size-5 shrink-0 accent-ink"
                    />
                  </label>
                </li>
              )
            })}
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
