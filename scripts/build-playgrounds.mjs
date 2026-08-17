/**
 * Génère les fichiers statiques des aires de jeux, à partir d'OpenStreetMap.
 *
 *   npm run playgrounds              reprend le travail : les cellules déjà écrites
 *                                    ne sont pas réinterrogées
 *   npm run playgrounds -- --fresh   repart de zéro
 *
 * La commande est reprenable parce qu'elle est longue et que le service en face lâche
 * souvent : une interruption ne doit pas se repayer en requêtes.
 *
 * Pourquoi un fichier plutôt qu'un appel à l'exécution : Overpass est un service
 * bénévole qui, mesuré en série sur une même vue, échoue **trois fois sur huit**
 * (504 de passerelle, 429 de quota, pages « too busy »). C'était intenable pour une
 * catégorie de l'application. Ici l'aléa est déplacé au moment de la génération, où
 * une reprise ne coûte que du temps machine et où personne n'attend devant un écran.
 *
 * La sortie est découpée en **cellules d'un degré** (`public/data/playgrounds/`), que
 * l'application charge selon la vue. Une cellule pèse quelques kilo-octets, elle est
 * servie avec les autres fichiers statiques et mise en cache par le service worker :
 * l'affichage devient instantané et fonctionne hors-ligne.
 *
 * À relancer de temps en temps — les aires de jeux bougent peu. La date de génération
 * est inscrite dans `index.json` et affichée dans la fiche.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const SORTIE = join(RACINE, 'public/data/playgrounds')

const ENDPOINT = 'https://overpass-api.de/api/interpreter'

/**
 * Overpass répond 406 au `User-Agent` par défaut de Node, et l'usage veut qu'un
 * script en lot s'identifie.
 */
const AGENT = 'sportsderue-playgrounds/1.0 (script de génération, https://github.com/locher/Sportsderue)'

/**
 * Cellules à interroger, décrites **bande de latitude par bande de latitude**.
 *
 * Un simple rectangle autour de la France paraît plus court à écrire, mais il ramasse
 * Barcelone, Londres, Milan, Francfort et la Belgique : la première tentative écrivait
 * 122 ko rien que pour la cellule de Barcelone. Suivre la forme du pays divise le
 * volume et le nombre de requêtes par deux, sans rien perdre — les cellules
 * frontalières restent entières, ce qui est même utile de part et d'autre.
 *
 * `[latitude, longitude minimale, longitude maximale]`, coins sud-ouest.
 */
const BANDES = [
  [51, 1, 2], //  pointe du Nord, Dunkerque
  [50, -2, 4], //  Manche, Hauts-de-France
  [49, -2, 6], //  Normandie → Moselle
  [48, -5, 8], //  Bretagne → Alsace
  [47, -5, 7], //  Loire-Atlantique → Jura
  [46, -3, 7], //  Vendée → Haute-Savoie
  [45, -2, 7], //  Gironde → Alpes
  [44, -2, 7], //  Aquitaine → Alpes-Maritimes
  [43, -2, 7], //  Pyrénées → Côte d'Azur
  [42, -2, 9], //  Pyrénées-Orientales et Corse nord
  [41, 8, 9], //  Corse sud
  // Départements et régions d'outre-mer.
  [16, -62, -61], // Guadeloupe
  [14, -62, -60], // Martinique
  [5, -55, -51], // Guyane
  [4, -55, -51],
  [3, -55, -51],
  [2, -55, -51],
  [-21, 55, 55], // La Réunion
  [-13, 45, 45], // Mayotte
]

/** Mêmes exigences d'accès que le filtre « propriétaire public » du RES. */
const ACCES_FERME = ['private', 'customers', 'no', 'permit', 'members', 'residents']

/** Étiquettes conservées : tout ce que la liste ou la fiche sait afficher. */
const TAGS_UTILES = [
  'name',
  'operator',
  'lit',
  'wheelchair',
  'surface',
  'min_age',
  'max_age',
  'opening_hours',
  'description',
  'website',
  'start_date',
  'check_date',
  'survey:date',
  'toilets',
  'addr:housenumber',
  'addr:street',
  'addr:postcode',
  'addr:city',
]

const KIND = { node: 0, way: 1, relation: 2 }

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function ouvertATous(tags = {}) {
  if (tags.access && ACCES_FERME.includes(tags.access)) return false
  return tags.indoor !== 'yes' && tags.fee !== 'yes'
}

/**
 * Un appel Overpass, avec reprises. C'est ici qu'on absorbe l'instabilité du service :
 * mesuré pendant une génération, environ **deux appels sur cinq** échouent (504 de
 * passerelle, pages « too busy » servies en 200). Huit essais, en doublant l'attente,
 * suffisent largement — l'échec est aléatoire, pas persistant.
 */
async function interroger(query, essais = 8) {
  let dernier
  for (let essai = 1; essai <= essais; essai += 1) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'user-agent': AGENT, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
      })
      const texte = await res.text()
      if (res.ok && texte.startsWith('{')) return JSON.parse(texte)
      // 200 avec du HTML = page « too busy » ; le corps compte autant que le statut.
      throw new Error(`${res.status}`)
    } catch (cause) {
      dernier = cause
      if (essai === essais) break
      await dormir(Math.min(2000 * 2 ** (essai - 1), 20000))
    }
  }
  throw dernier
}

/** Aires de jeux d'une cellule d'un degré, sous forme compacte. */
async function cellule(lat, lon) {
  const query =
    `[out:json][timeout:180];nwr["leisure"="playground"](${lat},${lon},${lat + 1},${lon + 1});` +
    'out tags center;'
  const data = await interroger(query)

  const aires = []
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {}
    if (!ouvertATous(tags)) continue
    const y = el.lat ?? el.center?.lat
    const x = el.lon ?? el.center?.lon
    if (!Number.isFinite(y) || !Number.isFinite(x)) continue
    // Une aire n'est écrite que dans la cellule qui la contient : les emprises se
    // touchent, Overpass renvoie les objets à cheval des deux côtés.
    if (Math.floor(y) !== lat || Math.floor(x) !== lon) continue

    const garde = {}
    for (const clef of TAGS_UTILES) if (tags[clef]) garde[clef] = tags[clef]
    // Les équipements de jeu sont éclatés en `playground`, `playground_1`, `playground_2`…
    const jeux = []
    for (const [clef, valeur] of Object.entries(tags)) {
      if (clef === 'playground' || /^playground_\d+$/.test(clef)) jeux.push(...valeur.split(';'))
    }
    if (jeux.length) garde.playground = [...new Set(jeux.map((v) => v.trim()))].join(';')

    const enregistrement = [KIND[el.type], el.id, Number(y.toFixed(5)), Number(x.toFixed(5))]
    if (Object.keys(garde).length) enregistrement.push(garde)
    aires.push(enregistrement)
  }
  return aires
}

/**
 * Deux cellules de front : c'est exactement le nombre de créneaux qu'Overpass accorde
 * par adresse IP (« Rate limit: 2 »). En demander plus vaudrait des 429, en demander
 * moins doublerait la durée sans ménager personne.
 */
const PARALLELE = 2

async function principal() {
  await mkdir(SORTIE, { recursive: true })

  // Reprise : une cellule déjà écrite n'est pas réinterrogée. Un service bénévole n'a
  // pas à repayer une interruption de notre côté. `--fresh` force le renouvellement.
  const fresh = process.argv.includes('--fresh')

  const cellules = []
  for (const [lat, minLon, maxLon] of BANDES) {
    for (let lon = minLon; lon <= maxLon; lon += 1) cellules.push([lat, lon])
  }
  const attendues = new Set(cellules.map(([lat, lon]) => `${lat}_${lon}`))

  const deja = new Map()
  for (const nom of await readdir(SORTIE)) {
    if (nom === 'index.json' || !nom.endsWith('.json')) continue
    const clef = nom.replace('.json', '')
    // Élagage : un fichier hors de la liste courante est un reste d'une exécution
    // précédente, découpée autrement. Sans ce ménage il serait livré en silence —
    // c'est comme ça que quatre cellules espagnoles ont failli partir en production.
    if (fresh || !attendues.has(clef)) {
      await rm(join(SORTIE, nom))
      continue
    }
    deja.set(clef, JSON.parse(await readFile(join(SORTIE, nom), 'utf8')).length)
  }

  console.log(
    `${cellules.length} cellules, dont ${deja.size} déjà écrites et conservées.` +
      (fresh ? ' (--fresh : tout est réinterrogé)' : ''),
  )

  const index = Object.fromEntries(deja)
  const restantes = cellules.filter(([lat, lon]) => !deja.has(`${lat}_${lon}`))
  const aFaire = restantes.length
  const échecs = []
  let faites = 0

  const travailleur = async () => {
    for (;;) {
      const suivante = restantes.shift()
      if (!suivante) return
      const [lat, lon] = suivante
      const clef = `${lat}_${lon}`
      try {
        const aires = await cellule(lat, lon)
        if (aires.length) {
          await writeFile(join(SORTIE, `${clef}.json`), JSON.stringify(aires))
          index[clef] = aires.length
        }
        faites += 1
        console.log(`[${faites}/${aFaire}] ${clef} → ${aires.length || 'vide'}`)
      } catch (cause) {
        faites += 1
        console.log(`[${faites}/${aFaire}] ${clef} → ÉCHEC : ${cause.message}`)
        échecs.push(clef)
      }
      await dormir(600)
    }
  }

  await Promise.all(Array.from({ length: PARALLELE }, travailleur))

  const total = Object.values(index).reduce((a, b) => a + b, 0)
  await writeFile(
    join(SORTIE, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), total, cells: index }),
  )
  console.log(`\n${total} aires de jeux dans ${Object.keys(index).length} cellules.`)
  if (échecs.length) {
    console.log(`${échecs.length} cellule(s) en échec : ${échecs.join(', ')}`)
    console.log('Relancer la commande les reprendra, les autres sont conservées.')
    process.exitCode = 1
  }
}

await principal()
