#!/usr/bin/env node
/**
 * Mesure la couverture Panoramax sur un échantillon d'équipements du RES.
 *
 * Pourquoi ce script existe : la question « peut-on afficher un aperçu photo dans la
 * fiche ? » se tranche sur un taux de couverture, pas sur une impression. La réponse
 * d'août 2026 a été non (36 % en France, 14 % en zone rurale, et une vignette qui
 * regarde la route plutôt que l'équipement) — voir CLAUDE.md, « Voir la rue : pourquoi
 * un lien et pas une image ». Mais Panoramax grandit vite : plutôt que de figer le
 * chiffre, on garde de quoi le refaire.
 *
 *   npm run mesure-panoramax
 *
 * Deux passages, parce qu'ils ne disent pas la même chose :
 *  1. par département, sur quatre profils — c'est la couverture « France entière » ;
 *  2. dans le cœur de douze grandes villes — c'est l'usage réel de l'application, qui
 *     est une carte urbaine.
 *
 * Aucune clé n'est nécessaire. `api.panoramax.xyz` est l'instance **fédérée** : elle
 * sert aussi les photos de `panoramax.ign.fr`, inutile d'interroger les deux (vérifié
 * sur 360 points, aucun couvert par l'IGN seul).
 */

const DATASET = 'https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es'
const PANORAMAX = 'https://api.panoramax.xyz/api'
const UA = 'Sportsderue/1.0 (mesure de couverture ; https://github.com/locher/Sportsderue)'

/** Mêmes filtres que l'application, pour mesurer sur ce qui est réellement affiché. */
const OUTDOOR_NATURES = [
  'Découvert',
  'Découvrable',
  'Extérieur couvert',
  'Site naturel',
  'Site naturel aménagé',
  'Site artificiel',
]
const PUBLIC_OWNER_TYPES = [
  'Commune',
  'EPCI',
  'Département',
  'Région',
  'Etat',
  'Etablissement Public',
  'Multi-propriétaire',
]

/** Départements sondés, par profil. */
const DEPARTEMENTS = [
  ['Paris', 'urbain dense'],
  ['Rhône', 'urbain dense'],
  ['Nord', 'urbain dense'],
  ['Bouches-du-Rhône', 'urbain dense'],
  ['Haute-Garonne', 'urbain + périurbain'],
  ['Vendée', 'mixte'],
  ['Doubs', 'mixte'],
  ['Finistère', 'mixte'],
  ['Cantal', 'rural'],
  ['Lozère', 'rural'],
  ['Creuse', 'rural'],
  ['Gers', 'rural'],
]

/** Cœurs de ville, emprises d'environ 6 km de côté : minLat, minLon, maxLat, maxLon. */
const VILLES = {
  Paris: [48.8296, 2.3112, 48.8836, 2.3932],
  Lyon: [45.7233, 4.796, 45.7933, 4.893],
  Marseille: [43.257, 5.332, 43.327, 5.429],
  Toulouse: [43.5697, 1.396, 43.6397, 1.493],
  Nantes: [47.1914, -1.5946, 47.2454, -1.5126],
  Bordeaux: [44.8028, -0.627, 44.8728, -0.53],
  Lille: [50.6019, 3.013, 50.6719, 3.11],
  Strasbourg: [48.5476, 7.7, 48.6176, 7.797],
  Rennes: [48.08, -1.725, 48.15, -1.628],
  Brest: [48.3572, -4.534, 48.4272, -4.437],
  Montpellier: [43.5768, 3.83, 43.6468, 3.927],
  Nice: [43.6653, 7.217, 43.7353, 7.314],
}

const PAR_DEPARTEMENT = 30
const PAR_VILLE = 25
/** Rayon retenu : au-delà, une photo ne montre plus l'équipement mais son quartier. */
const RAYON_M = 100
const PARALLELE = 4

const quote = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const inList = (field, values) => `${field} IN (${values.map(quote).join(', ')})`

async function getJson(url, essais = 4) {
  for (let i = 0; i < essais; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
      return await res.json()
    } catch (err) {
      if (i === essais - 1) throw err
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i))
    }
  }
}

async function enParallele(items, limite, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: limite }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k])
      }
    }),
  )
  return out
}

const SELECT = 'equip_numero,equip_nom,equip_type_name,new_name,equip_coordonnees'

function recordsUrl(clauses) {
  const where = [
    'equip_acc_libre = "true"',
    inList('equip_prop_type', PUBLIC_OWNER_TYPES),
    inList('equip_nature', OUTDOOR_NATURES),
    ...clauses,
  ].join(' AND ')
  return (
    `${DATASET}/records?select=${encodeURIComponent(SELECT)}` +
    `&where=${encodeURIComponent(where)}&limit=100&order_by=${encodeURIComponent('equip_numero')}`
  )
}

const enPoint = (r, groupe) => ({
  groupe,
  id: r.equip_numero,
  type: r.equip_type_name,
  lat: r.equip_coordonnees.lat,
  lon: r.equip_coordonnees.lon,
})

/** Échantillon régulier sur toute la liste triée : sinon on reste sur une seule commune. */
async function echantillonDepartement(dep) {
  const url = recordsUrl([`dep_nom = ${quote(dep)}`])
  const premiere = await getJson(`${url}&offset=0`)
  const total = premiere.total_count
  if (!total) return []
  const pas = Math.max(1, Math.floor(total / PAR_DEPARTEMENT))
  const pages = new Map([[0, premiere]])
  const points = []
  for (let i = 0; i < PAR_DEPARTEMENT; i++) {
    const offset = Math.min(i * pas, total - 1, 9999)
    const page = Math.floor(offset / 100) * 100
    if (!pages.has(page)) pages.set(page, await getJson(`${url}&offset=${page}`))
    const rec = pages.get(page).results[offset - page]
    if (rec?.equip_coordonnees) points.push(enPoint(rec, dep))
  }
  return points
}

async function echantillonVille(ville, [minLat, minLon, maxLat, maxLon]) {
  const url = recordsUrl([`in_bbox(equip_coordonnees, ${minLat}, ${minLon}, ${maxLat}, ${maxLon})`])
  const page = await getJson(url)
  const recs = (page.results ?? []).filter((r) => r.equip_coordonnees)
  const pas = Math.max(1, Math.floor(recs.length / PAR_VILLE))
  return recs.filter((_, i) => i % pas === 0).slice(0, PAR_VILLE).map((r) => enPoint(r, ville))
}

/**
 * Une photo « voit »-elle ce point ?
 *
 * `place_position` ne renvoie que des photos 360° ou orientées vers le lieu demandé.
 * Attention : `place_fov_tolerance` est **ignoré pour les photos 360°** (la doc le dit),
 * donc pour elles ce n'est qu'un filtre de distance — la photo existe, rien ne garantit
 * que l'équipement soit visible dessus. C'est le cœur du problème.
 */
async function sonde(point) {
  const url =
    `${PANORAMAX}/search?place_position=${point.lon},${point.lat}` +
    `&place_distance=3-${RAYON_M}&limit=1`
  try {
    const d = await getJson(url)
    const f = (d.features ?? [])[0]
    if (!f) return { couvert: false }
    const orientation = f.properties?.['pers:interior_orientation']
    return {
      couvert: true,
      panoramique: orientation?.field_of_view === 360,
      annee: f.properties?.datetime?.slice(0, 4) ?? null,
    }
  } catch (err) {
    return { erreur: String(err) }
  }
}

function tableau(titre, lignes) {
  console.log(`\n${titre}`)
  const largeur = Math.max(...lignes.map(([l]) => l.length), 10)
  for (const [label, couverts, total] of lignes) {
    const part = total ? Math.round((100 * couverts) / total) : 0
    const barre = '█'.repeat(Math.round(part / 4)).padEnd(25, '·')
    console.log(`  ${label.padEnd(largeur)}  ${barre} ${String(part).padStart(3)} %  (${couverts}/${total})`)
  }
}

function bilan(points, profils) {
  const parGroupe = new Map()
  for (const p of points) {
    const g = profils ? profils[p.groupe] : p.groupe
    const e = parGroupe.get(g) ?? { couverts: 0, total: 0 }
    e.total++
    if (p.sonde.couvert) e.couverts++
    parGroupe.set(g, e)
  }
  return [...parGroupe].map(([g, e]) => [g, e.couverts, e.total])
}

async function main() {
  const erreurs = []

  console.error('Échantillonnage par département…')
  const parDep = []
  for (const [dep] of DEPARTEMENTS) parDep.push(...(await echantillonDepartement(dep)))

  console.error('Échantillonnage par cœur de ville…')
  const parVille = []
  for (const [ville, bbox] of Object.entries(VILLES)) {
    parVille.push(...(await echantillonVille(ville, bbox)))
  }

  console.error(`Sondage Panoramax sur ${parDep.length + parVille.length} points…`)
  for (const lot of [parDep, parVille]) {
    const sondes = await enParallele(lot, PARALLELE, sonde)
    lot.forEach((p, i) => {
      p.sonde = sondes[i]
      if (sondes[i].erreur) erreurs.push(sondes[i].erreur)
    })
  }

  const profils = Object.fromEntries(DEPARTEMENTS)
  console.log(`\nPanoramax — photo à moins de ${RAYON_M} m orientée vers l’équipement`)
  console.log(`Échantillon : ${parDep.length} équipements en département, ${parVille.length} en cœur de ville.`)

  tableau('Par profil de département', bilan(parDep, profils))
  tableau('Par département', bilan(parDep, null))
  tableau('Par cœur de ville', bilan(parVille, null))

  const tous = [...parDep, ...parVille]
  const couverts = tous.filter((p) => p.sonde.couvert)
  const nat = parDep.filter((p) => p.sonde.couvert).length
  const ville = parVille.filter((p) => p.sonde.couvert).length
  console.log(`\nFrance, tous profils confondus : ${Math.round((100 * nat) / parDep.length)} %`)
  console.log(`Cœur des grandes villes        : ${Math.round((100 * ville) / parVille.length)} %`)

  // La part de photos 360° décide de la faisabilité d'un aperçu : leur vignette regarde
  // la direction de marche, pas l'équipement. La redresser impose de télécharger le
  // panorama entier (`sd.jpg`, ~264 ko) et de le recadrer au canvas.
  const pano = couverts.filter((p) => p.sonde.panoramique).length
  console.log(
    `\nParmi les points couverts : ${Math.round((100 * pano) / (couverts.length || 1))} % de photos 360° ` +
      `(vignette inutilisable telle quelle), ${couverts.length - pano} photos plates.`,
  )
  const annees = {}
  for (const p of couverts) if (p.sonde.annee) annees[p.sonde.annee] = (annees[p.sonde.annee] ?? 0) + 1
  console.log(
    'Années des photos : ' +
      Object.entries(annees)
        .sort()
        .map(([a, n]) => `${a}×${n}`)
        .join(' '),
  )
  if (erreurs.length) console.error(`\n${erreurs.length} sondage(s) en erreur, par ex. ${erreurs[0]}`)
}

await main()
