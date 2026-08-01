/**
 * Thème du fond de carte.
 *
 * La Géoplateforme publie plusieurs styles pour les tuiles vectorielles Plan IGN.
 * Le plus sobre (« épuré ») sert de base, mais sa palette reste celle d'une carte
 * topographique : beiges, ocres, bleus francs. On la retraduit dans la palette de
 * l'application — terre presque blanche, végétation sauge, eau ardoise, routes
 * blanches — pour que les seules couleurs saturées de l'écran soient les épingles.
 *
 * Le retraitement se fait couleur par couleur, en traversant les expressions
 * MapLibre : la hiérarchie des routes et les variations selon le zoom sont donc
 * conservées intactes.
 */
import type { StyleSpecification } from 'maplibre-gl'

const STYLE_URL =
  'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/epure.json'

/** Couleur de la terre, identique au fond de l'application. */
export const MAP_LAND = '#f4f4ed'

interface Recipe {
  /** Teinte imposée, en degrés. */
  hue: number
  /** Saturation imposée (0–1). */
  saturation: number
  /** Clarté = base + range × clarté d'origine. */
  base: number
  range: number
  /**
   * Laisse le blanc intact. Réservé aux routes : c'est leur blanc franc sur la
   * terre plus sourde qui dessine la trame de la ville.
   */
  keepWhite?: boolean
}

/** Les traits ont besoin d'être un peu plus sombres que les surfaces pour se lire. */
const DARKEN_LINES = 0.05

/**
 * La terre est la surface la plus claire ; tout le reste s'en écarte à peine, sauf
 * la végétation et l'eau qui gardent leur teinte. Le premier préfixe qui correspond
 * l'emporte : `bati_zone` (les îlots urbains) passe donc avant `bati` (les bâtiments).
 */
const RECIPES: [prefix: string, recipe: Recipe][] = [
  ['hydro', { hue: 198, saturation: 0.36, base: 0.74, range: 0.12 }],
  // La végétation tire vers le lime de l'application : les parcs se lisent comme
  // des terrains de jeu, et la carte parle la même langue que l'interface.
  ['ocs_vegetation', { hue: 84, saturation: 0.42, base: 0.8, range: 0.1 }],
  ['ocs_nature_sol', { hue: 88, saturation: 0.18, base: 0.88, range: 0.06 }],
  ['oro_relief', { hue: 90, saturation: 0.05, base: 0.92, range: 0.04 }],
  ['bati_zone', { hue: 90, saturation: 0.06, base: 0.9, range: 0.04 }],
  ['bati', { hue: 90, saturation: 0.06, base: 0.86, range: 0.06 }],
  ['ferre', { hue: 90, saturation: 0.04, base: 0.78, range: 0.09 }],
  ['limite', { hue: 90, saturation: 0.07, base: 0.86, range: 0.07 }],
  ['routier', { hue: 90, saturation: 0.05, base: 0.85, range: 0.09, keepWhite: true }],
]

/** Couleur des libellés, par famille de toponyme. */
const LABEL_COLORS: [prefix: string, color: string][] = [
  ['toponyme_hydro', '#8fa9b0'],
  ['toponyme_ocs', '#7f9072'],
  ['toponyme_oro', '#8b8378'],
  ['toponyme_routier_borne', '#9aa39b'],
  ['toponyme_parcellaire', '#9aa39b'],
]

const DEFAULT_LABEL = '#3c4a43'

function recipeFor(sourceLayer: string): Recipe | null {
  for (const [prefix, recipe] of RECIPES) {
    if (sourceLayer.startsWith(prefix)) return recipe
  }
  return null
}

function labelColorFor(sourceLayer: string): string {
  for (const [prefix, color] of LABEL_COLORS) {
    if (sourceLayer.startsWith(prefix)) return color
  }
  return DEFAULT_LABEL
}

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(value: string): Rgba | null {
  const text = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((c) => c + c)
            .join('')
        : digits
    return {
      r: parseInt(full.slice(0, 2), 16) / 255,
      g: parseInt(full.slice(2, 4), 16) / 255,
      b: parseInt(full.slice(4, 6), 16) / 255,
      a: 1,
    }
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => Number(p.trim()))
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null
    return {
      r: parts[0] / 255,
      g: parts[1] / 255,
      b: parts[2] / 255,
      a: parts.length > 3 ? parts[3] : 1,
    }
  }
  return null
}

function formatColor({ r, g, b, a }: Rgba): string {
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  if (a >= 1) {
    return `#${[r, g, b].map((v) => to255(v).toString(16).padStart(2, '0')).join('')}`
  }
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${Math.round(a * 100) / 100})`
}

function lightness({ r, g, b }: Rgba): number {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

function fromHsl(hue: number, saturation: number, light: number, alpha: number): Rgba {
  const c = (1 - Math.abs(2 * light - 1)) * saturation
  const h = (((hue % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = light - c / 2
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ]
  const [r, g, b] = table[Math.floor(h) % 6]
  return { r: r + m, g: g + m, b: b + m, a: alpha }
}

function retint(value: string, recipe: Recipe, isLine: boolean): string {
  const color = parseColor(value)
  if (!color) return value
  const light = lightness(color)
  if (recipe.keepWhite && light > 0.97) return value
  const target = recipe.base + recipe.range * light - (isLine ? DARKEN_LINES : 0)
  return formatColor(fromHsl(recipe.hue, recipe.saturation, target, color.a))
}

/** Applique une transformation à toutes les couleurs d'une valeur de style. */
function mapColors(value: unknown, transform: (color: string) => string): unknown {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map((item) => mapColors(item, transform))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = mapColors(item, transform)
    }
    return out
  }
  return value
}

const COLOR_KEYS = [
  'fill-color',
  'fill-outline-color',
  'fill-extrusion-color',
  'line-color',
  'background-color',
  'circle-color',
  'circle-stroke-color',
] as const

type Paint = Record<string, unknown>

function themeLayer(layer: Record<string, unknown>): void {
  const paint = layer.paint as Paint | undefined
  if (!paint) return
  const sourceLayer = String(layer['source-layer'] ?? layer.id ?? '')

  if (layer.type === 'symbol') {
    const text = paint['text-color']
    const existing = typeof text === 'string' ? parseColor(text) : null
    // Les numéros de route sont écrits en clair sur une pastille sombre : on les
    // laisse tels quels, sinon ils deviendraient illisibles.
    if (!existing || lightness(existing) < 0.85) {
      paint['text-color'] = labelColorFor(sourceLayer)
      paint['text-halo-color'] = 'rgba(255, 255, 255, 0.9)'
    }
    return
  }

  if (sourceLayer === 'fond_opaque') {
    paint['fill-color'] = MAP_LAND
    return
  }

  const recipe = recipeFor(sourceLayer)
  if (!recipe) return
  for (const key of COLOR_KEYS) {
    if (!(key in paint)) continue
    const isLine = key.startsWith('line') || key.endsWith('outline-color')
    paint[key] = mapColors(paint[key], (color) => retint(color, recipe, isLine))
  }
}

/**
 * Charge le style Plan IGN et le retraduit dans la palette de l'application.
 * En cas d'échec, l'appelant peut se rabattre sur l'URL brute du style.
 */
export async function loadMapStyle(signal?: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(STYLE_URL, { signal })
  if (!response.ok) throw new Error(`Style IGN indisponible (${response.status})`)
  const style = (await response.json()) as StyleSpecification & {
    layers: Record<string, unknown>[]
  }

  for (const layer of style.layers) themeLayer(layer)

  // Une couche de fond garantit la bonne couleur de terre avant l'arrivée des tuiles.
  style.layers.unshift({
    id: 'fond-application',
    type: 'background',
    paint: { 'background-color': MAP_LAND },
  })

  return style as StyleSpecification
}

export { STYLE_URL as MAP_STYLE_URL }
