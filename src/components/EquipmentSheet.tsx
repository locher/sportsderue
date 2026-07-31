import { useEffect, useState } from 'react'
import type { Equipment, EquipmentDetail } from '../types'
import { fetchEquipmentDetail, officialRecordUrl } from '../lib/dataes'
import { directionsUrl, formatDistance } from '../lib/geo'
import { categoryStyle } from '../lib/sports'
import { BottomSheet } from './BottomSheet'
import {
  AccessibleIcon,
  BulbIcon,
  InfoIcon,
  PinIcon,
  RouteIcon,
  RulerIcon,
  ShareIcon,
  Spinner,
  TreeIcon,
  WalkIcon,
} from './Icons'

interface Props {
  equipment: Equipment | null
  onClose: () => void
}

const NATURE_LABEL: Record<string, string> = {
  Découvert: 'Plein air',
  Découvrable: 'Toit ouvrant',
  'Extérieur couvert': 'Extérieur couvert',
  Intérieur: 'En salle',
  'Site naturel': 'Site naturel',
  'Site naturel aménagé': 'Site naturel aménagé',
  'Site artificiel': 'Site artificiel',
}

export function EquipmentSheet({ equipment, onClose }: Props) {
  const [detail, setDetail] = useState<EquipmentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!equipment) {
      setDetail(null)
      return
    }
    setDetail(null)
    setLoading(true)
    const controller = new AbortController()
    fetchEquipmentDetail(equipment.id, controller.signal)
      .then(setDetail)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [equipment])

  const category = equipment ? categoryStyle(equipment.category) : null
  const address = equipment
    ? [equipment.address, [equipment.postcode, equipment.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : ''

  const share = async () => {
    if (!equipment) return
    const url = new URL(window.location.href)
    url.searchParams.set('e', equipment.id)
    url.searchParams.set('lat', equipment.lat.toFixed(5))
    url.searchParams.set('lng', equipment.lon.toFixed(5))
    url.searchParams.set('z', '16')
    const data = { title: equipment.name, text: `${equipment.type} — ${equipment.city ?? ''}`, url: url.toString() }
    try {
      if (navigator.share) await navigator.share(data)
      else await navigator.clipboard.writeText(url.toString())
    } catch {
      // Partage annulé : rien à faire.
    }
  }

  const facts: { icon: React.ReactNode; label: string; value: string }[] = []
  if (equipment?.nature) {
    facts.push({
      icon: <TreeIcon />,
      label: 'Nature',
      value: NATURE_LABEL[equipment.nature] ?? equipment.nature,
    })
  }
  if (detail?.floor) facts.push({ icon: <RulerIcon />, label: 'Revêtement', value: detail.floor })
  if (detail?.length && detail?.width) {
    facts.push({
      icon: <RulerIcon />,
      label: 'Dimensions',
      value: `${detail.length} × ${detail.width} m`,
    })
  } else if (detail?.surface) {
    facts.push({ icon: <RulerIcon />, label: 'Surface', value: `${detail.surface} m²` })
  }
  if (equipment?.lit) facts.push({ icon: <BulbIcon />, label: 'Éclairage', value: 'Oui' })
  if (equipment?.accessible) {
    facts.push({ icon: <AccessibleIcon />, label: 'Accès PMR', value: 'Déclaré accessible' })
  }
  if (detail?.toilets) facts.push({ icon: <InfoIcon />, label: 'Sanitaires', value: 'Sur place' })
  if (detail?.serviceDate) {
    facts.push({ icon: <InfoIcon />, label: 'Mise en service', value: detail.serviceDate })
  }

  return (
    <BottomSheet
      open={equipment !== null}
      title={equipment?.name ?? ''}
      onClose={onClose}
      footer={
        equipment && (
          <div className="flex gap-2">
            <a
              href={directionsUrl(equipment, equipment.name)}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 py-3 font-semibold text-white active:bg-brand-dark"
            >
              <RouteIcon /> Itinéraire
            </a>
            <button
              type="button"
              onClick={() => void share()}
              aria-label="Partager cet équipement"
              className="grid size-12 shrink-0 place-items-center rounded-full border border-line text-ink active:bg-canvas"
            >
              <ShareIcon />
            </button>
          </div>
        )
      }
    >
      {equipment && (
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl"
              style={{ backgroundColor: `${category?.color ?? '#0f7b5f'}1a` }}
            >
              {category?.emoji}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{equipment.type}</p>
              <p className="text-sm text-muted">
                {equipment.installation && equipment.installation !== equipment.name
                  ? equipment.installation
                  : (detail?.department ?? equipment.city ?? '')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-brand-light px-3 py-1 text-sm font-medium text-brand-dark">
              Accès libre
            </span>
            {equipment.distance !== undefined && (
              <span className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-sm text-ink">
                <WalkIcon className="size-4" /> {formatDistance(equipment.distance)} à vol
                d’oiseau
              </span>
            )}
            {detail?.seasonal && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
                Ouverture saisonnière
              </span>
            )}
          </div>

          {address && (
            <p className="flex items-start gap-2 text-sm leading-relaxed">
              <PinIcon className="mt-0.5 size-4.5 shrink-0 text-muted" />
              <span>{address}</span>
            </p>
          )}

          {equipment.sports.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
                Activités praticables
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {equipment.sports.slice(0, 12).map((sport) => (
                  <li
                    key={sport}
                    className="rounded-lg bg-canvas px-2 py-1 text-sm text-ink"
                  >
                    {sport}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && !detail && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="size-4 animate-spin" /> Chargement de la fiche…
            </p>
          )}

          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-2">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-2xl border border-line p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="text-muted [&_svg]:size-4">{fact.icon}</span>
                    {fact.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {detail?.notes && (
            <p className="rounded-2xl bg-canvas p-3 text-sm leading-relaxed">
              <span className="font-medium">Observations : </span>
              {detail.notes}
            </p>
          )}

          {detail?.ownerName && (
            <p className="text-sm text-muted">
              Mis à disposition par {detail.ownerName}
              {detail.ownerType ? ` (${detail.ownerType})` : ''}.
            </p>
          )}

          <div className="space-y-1 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            <p>
              Données déclaratives du Recensement des équipements sportifs (RES)
              {detail?.updatedAt ? `, mises à jour le ${formatDate(detail.updatedAt)}` : ''}.
              L’accès peut être restreint temporairement : vérifiez sur place.
            </p>
            <a
              href={officialRecordUrl(equipment.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-medium text-brand underline"
            >
              Voir la fiche officielle ({equipment.id})
            </a>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
