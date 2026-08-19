import { useEffect, useRef, useState } from 'react'
import type { Equipment, EquipmentDetail } from '../types'
import { fetchEquipmentDetail, officialRecordUrl } from '../lib/dataes'
import { playgroundRecordUrl, playgroundsDate } from '../lib/playgrounds'
import { directionsUrl, formatDistance, streetViewUrl } from '../lib/geo'
import { sameLabel } from '../lib/text'
import { categoryStyle } from '../lib/sports'
import { distanceBucket, track } from '../lib/audience'
import { BottomSheet } from './BottomSheet'
import {
  AccessibleIcon,
  BulbIcon,
  ChevronIcon,
  InfoIcon,
  PinIcon,
  RouteIcon,
  RulerIcon,
  ShareIcon,
  Spinner,
  StreetViewIcon,
  WalkIcon,
} from './Icons'

interface Props {
  equipment: Equipment | null
  onClose: () => void
}

/** Teintes des tuiles de chiffres clés : lime, ciel, abricot. */
const STAT_TINTS = ['#d6fb4f', '#c3e5ff', '#ffdcc4']

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
  // Date d'extraction d'OpenStreetMap : la donnée fige entre deux générations, il
  // faut le dire plutôt que de laisser croire à du temps réel.
  const [osmDate, setOsmDate] = useState<string | null>(null)

  useEffect(() => {
    void playgroundsDate().then(setOsmDate)
  }, [])

  // L'objet `equipment` est refabriqué à chaque recalcul des distances, c'est-à-dire à
  // chaque fin de déplacement de la carte — le recentrage automatique sur le point
  // sélectionné en provoque un aussitôt la fiche ouverte. Se caler sur son identité
  // relançait donc l'appel réseau et faisait clignoter « Chargement de la fiche… » sur
  // une fiche déjà affichée, pour un contenu identique. Seul l'équipement *désigné*
  // compte : l'effet ne suit que son identifiant et sa base.
  const equipmentRef = useRef(equipment)
  equipmentRef.current = equipment
  const id = equipment?.id
  const source = equipment?.source

  useEffect(() => {
    const current = equipmentRef.current
    if (!current) {
      setDetail(null)
      return
    }
    // Le bon endroit pour compter une fiche ouverte : cet effet ne se rejoue que quand
    // l'équipement *désigné* change, et il couvre aussi l'ouverture par lien partagé,
    // qui ne passe pas par une tape. La catégorie et la base sont les seules choses
    // envoyées — jamais l'identifiant, jamais les coordonnées.
    track('equipement_ouvert', { source: current.source, sport: current.category })
    // Une aire de jeux arrive déjà complète : le fichier statique porte toutes ses
    // étiquettes, contrairement à Data ES dont la liste n'est qu'un extrait et qui
    // impose un second appel pour ouvrir une fiche.
    if (source === 'osm') {
      setDetail(current as EquipmentDetail)
      setLoading(false)
      return
    }
    setDetail(null)
    setLoading(true)
    const controller = new AbortController()
    fetchEquipmentDetail(current.id, controller.signal)
      .then(setDetail)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, source])

  const category = equipment ? categoryStyle(equipment.category) : null
  const address = equipment
    ? [equipment.address, [equipment.postcode, equipment.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : ''
  // Le bandeau porte déjà le nom et le type : la ligne de contexte complète l'adresse.
  // Beaucoup d'installations ne diffèrent de l'équipement que par la ponctuation
  // (« Le Plan - Montesquieu » / « Le Plan Montesquieu ») : on ne les répète pas.
  const subtitle =
    equipment?.installation && !sameLabel(equipment.installation, equipment.name)
      ? equipment.installation
      : (detail?.department ?? equipment?.city ?? '')

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

  // Les trois chiffres clés passent en tuiles colorées ; le reste va dans la grille
  // de caractéristiques, plus dense.
  const stats: { value: string; label: string }[] = []
  if (equipment?.distance !== undefined) {
    stats.push({ value: formatDistance(equipment.distance), label: 'à vol d’oiseau' })
  }
  // Sur une aire de jeux, la tranche d'âge prime sur tout le reste.
  if (detail?.ageRange) stats.push({ value: detail.ageRange, label: 'Âge conseillé' })
  if (equipment?.nature) {
    stats.push({ value: NATURE_LABEL[equipment.nature] ?? equipment.nature, label: 'Nature' })
  }
  if (detail?.floor) stats.push({ value: detail.floor, label: 'Revêtement' })
  if (detail?.length && detail?.width) {
    stats.push({
      value: `${formatMeasure(detail.length)} × ${formatMeasure(detail.width)} m`,
      label: 'Dimensions',
    })
  } else if (detail?.surface) {
    stats.push({ value: `${formatMeasure(detail.surface)} m²`, label: 'Surface' })
  }
  const keyStats = stats.slice(0, 3)

  const facts: { icon: React.ReactNode; label: string; value: string }[] = []
  for (const extra of stats.slice(3)) {
    facts.push({ icon: <RulerIcon />, label: extra.label, value: extra.value })
  }
  if (equipment?.lit) facts.push({ icon: <BulbIcon />, label: 'Éclairage', value: 'Oui' })
  if (equipment?.accessible) {
    facts.push({ icon: <AccessibleIcon />, label: 'Accès PMR', value: 'Déclaré accessible' })
  }
  if (detail?.toilets) facts.push({ icon: <InfoIcon />, label: 'Sanitaires', value: 'Sur place' })
  if (detail?.openingHours) {
    facts.push({ icon: <InfoIcon />, label: 'Horaires', value: detail.openingHours })
  }
  if (detail?.serviceDate) {
    facts.push({ icon: <InfoIcon />, label: 'Mise en service', value: detail.serviceDate })
  }

  return (
    <BottomSheet
      open={equipment !== null}
      title={equipment?.name ?? ''}
      onClose={onClose}
      hero={
        equipment && (
          <div
            className="relative shrink-0 px-5 pt-8 pb-5 text-white"
            style={{ backgroundColor: category?.deep ?? '#0a8552' }}
          >
            <div className="flex items-start gap-3 pr-12">
              <span
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-[19px] text-3xl"
                style={{ backgroundColor: 'rgb(255 255 255 / 0.18)' }}
              >
                {category?.emoji}
              </span>
              <div className="min-w-0 pt-1">
                {/* Beaucoup de fiches sont nommées d'après leur type : on affiche
                    alors la famille de sport plutôt que la même phrase deux fois. */}
                <p className="eyebrow text-white/70">
                  {sameLabel(equipment.type, equipment.name)
                    ? (category?.label ?? equipment.type)
                    : equipment.type}
                </p>
                <h2 className="display mt-2 text-[23px] leading-[1.12] text-balance">
                  {equipment.name}
                </h2>
              </div>
            </div>
            <p className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 text-[13px] font-extrabold text-ink">
                <WalkIcon className="size-4" /> Accès libre
              </span>
              {detail?.seasonal && (
                <span className="rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-bold">
                  Ouverture saisonnière
                </span>
              )}
            </p>
          </div>
        )
      }
      footer={
        equipment && (
          <div className="flex gap-2">
            <a
              href={directionsUrl(equipment, equipment.name)}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                track('on_y_va', {
                  source: equipment.source,
                  sport: equipment.category,
                  // En tranches, jamais au mètre : voir `distanceBucket`.
                  distance: distanceBucket(equipment.distance),
                })
              }
              className="springy flex flex-1 items-center justify-center gap-2 rounded-full bg-lime px-4 py-4 font-extrabold text-ink shadow-lift"
            >
              <RouteIcon /> On y va
            </a>
            <button
              type="button"
              onClick={() => void share()}
              aria-label="Partager cet équipement"
              className="springy grid size-14 shrink-0 place-items-center rounded-full bg-canvas text-ink"
            >
              <ShareIcon />
            </button>
          </div>
        )
      }
    >
      {equipment && (
        <div className="space-y-4 pb-2">
          {/* Chiffres clés en tuiles pleines : ce qu'on veut savoir avant de partir. */}
          {keyStats.length > 0 && (
            <dl className="grid auto-cols-fr grid-flow-col gap-2">
              {keyStats.map((stat, index) => (
                <div
                  key={stat.label}
                  className="rounded-[22px] p-3.5"
                  style={{ backgroundColor: STAT_TINTS[index % STAT_TINTS.length] }}
                >
                  <dd className="display text-lg leading-tight tabular-nums">{stat.value}</dd>
                  <dt className="mt-1 text-[11px] leading-tight font-semibold text-ink/60">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          )}

          {(address || subtitle) && (
            <p className="flex items-start gap-2.5 rounded-[22px] bg-canvas p-4 text-sm leading-relaxed">
              <PinIcon className="mt-0.5 size-4.5 shrink-0 text-ink" />
              <span>
                <span className="font-semibold">{address || subtitle}</span>
                {address && subtitle && (
                  <span className="mt-0.5 block text-muted">{subtitle}</span>
                )}
              </span>
            </p>
          )}

          {/* Le RES décrit beaucoup et ne montre rien : voir l'endroit est le seul moyen
              de juger l'état du sol, la clôture, les paniers. Lien sortant plutôt
              qu'image intégrée — le pourquoi est dans `streetViewUrl`. Il vit ici, au
              contact de l'adresse, et non dans le pied de page : c'est une vérification
              qu'on fait en lisant la fiche, pas l'action de départ. */}
          <a
            href={streetViewUrl(equipment)}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              track('voir_la_rue', { source: equipment.source, sport: equipment.category })
            }
            className="springy flex items-center gap-2.5 rounded-[22px] bg-canvas p-4 text-left"
          >
            <StreetViewIcon className="size-4.5 shrink-0 text-ink" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Voir la rue</span>
              <span className="mt-0.5 block text-xs text-muted">
                Vue immersive, ouvre Google Maps
              </span>
            </span>
            <ChevronIcon className="size-4 shrink-0 text-muted" />
          </a>

          {equipment.sports.length > 0 && (
            <div>
              <h3 className="eyebrow mb-2.5 text-muted">
                {equipment.source === 'osm' ? 'Sur place' : 'Activités praticables'}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {equipment.sports.slice(0, 12).map((sport) => (
                  <li
                    key={sport}
                    className="rounded-full bg-canvas px-3 py-1.5 text-[13px] leading-snug font-semibold text-ink"
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
                <div key={fact.label} className="rounded-[22px] bg-canvas p-3.5">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <span className="text-ink [&_svg]:size-4">{fact.icon}</span>
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {detail?.notes && (
            <p className="rounded-[22px] bg-canvas p-4 text-sm leading-relaxed">
              <span className="font-bold">Observations : </span>
              {detail.notes}
            </p>
          )}

          {detail?.ownerName && (
            <p className="text-sm text-muted">
              Mis à disposition par {detail.ownerName}
              {detail.ownerType ? ` (${detail.ownerType})` : ''}.
            </p>
          )}

          <div className="space-y-1.5 border-t border-line pt-3.5 text-xs leading-relaxed text-muted">
            {equipment.source === 'osm' ? (
              <>
                <p>
                  Aire de jeux cartographiée par les contributeurs d’OpenStreetMap
                  {detail?.updatedAt ? `, vérifiée le ${formatDate(detail.updatedAt)}` : ''}
                  {osmDate ? `, relevée le ${formatDate(osmDate)}` : ''}. Les équipements
                  et la tranche d’âge ne sont pas toujours renseignés : vérifiez sur place.
                </p>
                <a
                  href={playgroundRecordUrl(equipment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
                >
                  Voir ou corriger sur OpenStreetMap
                </a>
              </>
            ) : (
              <>
                <p>
                  Données déclaratives du Recensement des équipements sportifs (RES)
                  {detail?.updatedAt ? `, mises à jour le ${formatDate(detail.updatedAt)}` : ''}.
                  L’accès peut être restreint temporairement : vérifiez sur place.
                </p>
                <a
                  href={officialRecordUrl(equipment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-bold text-ink underline decoration-lime decoration-2 underline-offset-2"
                >
                  Voir la fiche officielle ({equipment.id})
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

/** Mesure en notation française : « 19,5 » et non « 19.5 ». */
function formatMeasure(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
