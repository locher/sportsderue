#!/usr/bin/env node
/**
 * Contrôle de conformité d'un déploiement.
 *
 * Pourquoi ce script existe : tout ce qui rend l'application correcte en production vit
 * dans la configuration du serveur, et **presque rien ne se voit quand c'est faux**. Un
 * `max-age` posé sur `sw.js` et les mises à jour ne partent plus jamais — l'application
 * continue de fonctionner, simplement figée sur une vieille version, exactement le
 * symptôme signalé depuis un téléphone en août 2026. Une compression oubliée et les
 * 936 ko de MapLibre partent bruts au lieu de 243 ko : personne ne le remarque depuis
 * une fibre. Ces deux-là ne se rattrapent pas à la lecture du code.
 *
 * Netlify en fournit une partie sans qu'on demande rien (compression, HSTS) : c'est
 * précisément ce qui rend une migration vers un serveur personnel risquée. Ce script est
 * l'arbitre commun — il ne connaît pas l'hébergeur, seulement le contrat.
 *
 *   npm run verifie-deploiement -- https://sportsderue.netlify.app
 *
 * Sortie non nulle si une règle **obligatoire** n'est pas tenue.
 */

const base = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!base) {
  console.error('Usage : npm run verifie-deploiement -- <url du site>')
  process.exit(2)
}

const SERVICES = ['data.geopf.fr', 'equipements.sports.gouv.fr', 'overpass-api.de']

let echecs = 0
let alertes = 0

const dit = (etat, titre, detail = '') => {
  const marque = { ok: '  ✓', ko: '  ✗', warn: '  !' }[etat]
  console.log(`${marque} ${titre}${detail ? ` — ${detail}` : ''}`)
  if (etat === 'ko') echecs++
  if (etat === 'warn') alertes++
}

const recupere = async (chemin, options = {}) => {
  const res = await fetch(`${base}${chemin}`, {
    redirect: 'follow',
    headers: { 'Accept-Encoding': 'gzip, br', ...(options.headers ?? {}) },
  })
  return res
}

/** `Cache-Control` qui oblige le navigateur à revalider à chaque fois. */
const revalide = (valeur) => {
  if (!valeur) return false
  const maxAge = /max-age\s*=\s*(\d+)/i.exec(valeur)
  const zero = !maxAge || Number(maxAge[1]) === 0
  return zero && /no-cache|must-revalidate|no-store/i.test(valeur)
}

/** `Cache-Control` qui autorise à garder le fichier très longtemps. */
const immuable = (valeur) => {
  if (!valeur) return false
  const maxAge = /max-age\s*=\s*(\d+)/i.exec(valeur)
  return Boolean(maxAge) && Number(maxAge[1]) >= 2_592_000 // 30 jours
}

console.log(`\nConformité du déploiement : ${base}\n`)

// --- 1. Contexte sécurisé ------------------------------------------------------------
console.log('Contexte')
if (base.startsWith('https://')) {
  dit('ok', 'servi en HTTPS')
} else if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
  dit('warn', 'origine locale', 'HTTPS non requis en local, obligatoire en ligne')
} else {
  dit('ko', 'servi en HTTP', 'le service worker et la géolocalisation exigent HTTPS')
}

// --- 2. Les trois fichiers qui portent la mise à jour ---------------------------------
// Ce sont les seuls qui gardent leur nom d'une version à l'autre : servis depuis un cache
// périmé, la nouvelle version n'est jamais découverte.
console.log('\nMise à jour automatique (fichiers à nom stable)')
const accueil = await recupere('/')
for (const [chemin, res] of [
  ['/', accueil],
  ['/sw.js', await recupere('/sw.js')],
  ['/manifest.webmanifest', await recupere('/manifest.webmanifest')],
]) {
  const cc = res.headers.get('cache-control')
  if (!res.ok) {
    dit('ko', `${chemin}`, `réponse ${res.status}`)
  } else if (revalide(cc)) {
    dit('ok', `${chemin} toujours revalidé`, cc)
  } else {
    dit('ko', `${chemin} mis en cache`, `${cc ?? 'aucun Cache-Control'} — les mises à jour ne partiront pas`)
  }
}

// --- 3. Fichiers à empreinte : immuables ---------------------------------------------
console.log('\nFichiers à empreinte')
const html = accueil.ok ? await accueil.text() : ''
const actifs = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])
const script = actifs.find((u) => u.endsWith('.js'))
if (!script) {
  dit('warn', 'aucun fichier /assets/ trouvé dans index.html', 'site non construit ?')
} else {
  const chemin = script.startsWith('http') ? new URL(script).pathname : script
  const res = await recupere(chemin)
  const cc = res.headers.get('cache-control')
  dit(immuable(cc) ? 'ok' : 'ko', `${chemin} gardé longtemps`, cc ?? 'aucun Cache-Control')

  // --- 4. Compression : Netlify la fait seul, un serveur nu non ----------------------
  const encodage = res.headers.get('content-encoding')
  const taille = res.headers.get('content-length')
  if (encodage) {
    dit('ok', 'compression active', `${encodage}${taille ? `, ${Math.round(taille / 1024)} ko` : ''}`)
  } else {
    dit('ko', 'aucune compression', 'le JS part brut : ~4× plus lourd sur mobile')
  }
}

// --- 5. Repli page unique ------------------------------------------------------------
console.log('\nRepli page unique')
const inconnue = await recupere('/une/route/qui/nexiste/pas')
const estHtml = (inconnue.headers.get('content-type') ?? '').includes('text/html')
dit(
  inconnue.ok && estHtml ? 'ok' : 'ko',
  'toute URL inconnue rend l’accueil',
  `${inconnue.status} ${inconnue.headers.get('content-type') ?? ''}`,
)

// --- 6. En-têtes de sécurité ---------------------------------------------------------
console.log('\nEn-têtes de sécurité')
const h = accueil.headers
const csp = h.get('content-security-policy')

if (!csp) {
  dit('ko', 'Content-Security-Policy', 'absente')
} else {
  const manquants = SERVICES.filter((s) => !csp.includes(s))
  if (/connect-src/.test(csp) && manquants.length === 0) {
    dit('ok', 'Content-Security-Policy', 'connect-src énumère les trois services')
  } else if (manquants.length) {
    dit('ko', 'Content-Security-Policy', `connect-src n’autorise pas : ${manquants.join(', ')}`)
  } else {
    dit('warn', 'Content-Security-Policy', 'présente mais sans connect-src')
  }
  const cadres = /frame-ancestors/.test(csp) || h.get('x-frame-options')
  dit(cadres ? 'ok' : 'ko', 'mise en cadre interdite', cadres ? '' : 'ni frame-ancestors ni X-Frame-Options')
}

for (const [nom, obligatoire, attendu] of [
  ['x-content-type-options', true, /nosniff/i],
  ['referrer-policy', true, /strict-origin|no-referrer/i],
  ['permissions-policy', false, /geolocation/i],
  ['strict-transport-security', true, /max-age=\d{7,}/i],
]) {
  const valeur = h.get(nom)
  if (valeur && attendu.test(valeur)) dit('ok', nom, valeur.slice(0, 70))
  else if (valeur) dit('warn', nom, `valeur inattendue : ${valeur.slice(0, 70)}`)
  else dit(obligatoire ? 'ko' : 'warn', nom, 'absent')
}

// --- 7. Types MIME ------------------------------------------------------------------
console.log('\nTypes MIME')
for (const [chemin, attendu] of [
  ['/manifest.webmanifest', 'application/manifest+json'],
  ['/favicon.svg', 'image/svg+xml'],
]) {
  const res = await recupere(chemin)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  if (type === attendu) dit('ok', chemin, type)
  else dit('warn', chemin, `${type || 'aucun'} au lieu de ${attendu}`)
}

// --- Verdict -------------------------------------------------------------------------
console.log(
  `\n${echecs === 0 ? 'Conforme' : `${echecs} règle(s) obligatoire(s) non tenue(s)`}` +
    `${alertes ? `, ${alertes} avertissement(s)` : ''}.\n`,
)
process.exit(echecs === 0 ? 0 : 1)
