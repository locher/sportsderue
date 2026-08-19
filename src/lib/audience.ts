/**
 * Mesure d'audience — cinq questions, et rien de plus.
 *
 * Les questions posées par le propriétaire du projet : combien de personnes viennent,
 * combien se géolocalisent, quels filtres de sport servent — et lesquels ne servent
 * jamais —, combien ouvrent « Voir la rue », combien partent avec « On y va ». Tout ce
 * qui est écrit ici sert à répondre à ces cinq questions ; tout le reste de ce que
 * PostHog sait faire est éteint, option par option, dans `init()` plus bas.
 *
 * Trois contraintes du projet décident de presque tout dans ce fichier :
 *
 * 1. **Aucun backend, aucune clé secrète.** La clé de projet PostHog ne sert qu'à
 *    *écrire* des événements : elle est publique par construction et vit dans le bundle.
 *    Elle arrive par `VITE_POSTHOG_KEY` au build et **son absence désactive tout** —
 *    aucun script chargé, aucun appel réseau, application identique à avant. C'est le
 *    cas en développement, où l'on ne veut surtout pas polluer les chiffres.
 * 2. **L'URL de cette application porte la position.** `lat`, `lng` et l'équipement
 *    consulté (`e`) sont dans l'adresse de la page, et PostHog joint `$current_url` à
 *    *chaque* événement : ils sont donc masqués avant l'envoi, et aucun événement ne
 *    porte de coordonnées ni d'identifiant d'équipement. Même précaution que le
 *    `Referrer-Policy` du site, pour la même raison — la position de quelqu'un n'a rien
 *    à faire chez un tiers.
 * 3. **Le poids compte.** PostHog pèse ~85 ko compressés, un tiers de MapLibre : il est
 *    chargé en `import()` dynamique **après** que la page est à l'écran, jamais avant.
 *    Les événements émis entre-temps sont mis en file et rejoués à l'arrivée.
 *
 * Deux choses à savoir avant de s'étonner des chiffres :
 *
 * - **Les bloqueurs de publicité bloquent l'envoi.** L'appel sort vers un domaine
 *   PostHog, que toutes les listes de filtrage connaissent : le comptage est donc un
 *   plancher, pas une mesure. Le contourner demanderait un relais sur notre propre
 *   domaine, donc un backend — exclu ici. Ne pas chercher à « réparer » un écart de
 *   20 à 30 % avec une autre source, c'est celui-là.
 * - **Le morceau de bundle ne s'appelle pas « posthog »** (`vite.config.ts` le nomme
 *   `mesure`) et il est exclu du précache du service worker. Les deux vont ensemble :
 *   un nom que les listes de filtrage reconnaissent ferait échouer la requête, et un
 *   fichier précaché qui échoue fait échouer l'installation du service worker — donc la
 *   mise à jour automatique de l'application, en silence. La mesure ne doit jamais
 *   pouvoir casser l'application.
 */
import type { PostHog } from 'posthog-js'

/** Clé de projet, injectée au build. Vide = mesure entièrement désactivée. */
const KEY = import.meta.env.VITE_POSTHOG_KEY?.trim()

/** Instance européenne par défaut : les données restent dans l'Union européenne. */
const HOST = import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com'

/**
 * Vrai si une clé a été fournie au build, donc si quelque chose est mesuré.
 *
 * L'interface s'en sert pour ne dire que la vérité : sans clé, la fiche « À propos »
 * n'annonce aucune mesure et ne propose aucun refus, puisqu'il n'y a rien à refuser.
 */
export const AUDIENCE_COMPILED = Boolean(KEY)

/** Refus mémorisé, à côté des filtres et pour la même raison : sans compte, sans cookie. */
const REFUSAL_KEY = 'sportsderue.audience.v1'

/**
 * Événements envoyés. La liste est fermée exprès : un nom inventé au vol dans un
 * composant ne se voit pas à la relecture, et se retrouve six mois plus tard en doublon
 * mal orthographié dans les tableaux de bord.
 *
 * Ce qu'ils répondent :
 * - `$pageview` (envoyé à la main, voir `load()`) — combien de personnes viennent ;
 * - `geolocalisation_demandee` / `geolocalisation_resultat` — combien se géolocalisent ;
 * - `filtre_sport` — quels sports sont filtrés, et lesquels ne le sont jamais (une
 *   catégorie absente de la répartition par `sport` n'a jamais servi à personne) ;
 * - `filtre_groupe`, `filtre_tous`, `filtres_reinitialises`, `filtre_caracteristique` —
 *   les gestes en bloc, tenus à part pour ne pas gonfler le compte par sport ;
 * - `equipement_ouvert` — le dénominateur des deux suivants ;
 * - `voir_la_rue`, `on_y_va` — les deux boutons de la fiche.
 */
export type AudienceEvent =
  | 'geolocalisation_demandee'
  | 'geolocalisation_resultat'
  | 'filtre_sport'
  | 'filtre_groupe'
  | 'filtre_tous'
  | 'filtre_caracteristique'
  | 'filtres_reinitialises'
  | 'equipement_ouvert'
  | 'voir_la_rue'
  | 'on_y_va'

type Props = Record<string, string | number | boolean | null>

/** Instance PostHog, une fois le script arrivé. */
let client: PostHog | null = null
/** Le chargement est lancé (ou terminé) : ne pas le relancer. */
let loading = false
/** Le chargement a échoué — hors-ligne, ou bloqué. On arrête d'essayer et de mettre en file. */
let broken = false

/**
 * Événements émis avant l'arrivée du script. Plafonnés : si le chargement n'aboutit
 * jamais, cette file ne doit pas grossir indéfiniment derrière une personne qui utilise
 * l'application pendant une heure.
 */
const pending: { name: AudienceEvent; props?: Props }[] = []
const PENDING_MAX = 40

/** Refus lu une fois, puis tenu à jour : `track()` est appelé à chaque tape. */
let refused: boolean | null = null

/** Vrai si la personne a refusé la mesure depuis la fiche « À propos ». */
export function audienceRefused(): boolean {
  if (refused === null) {
    try {
      refused = window.localStorage.getItem(REFUSAL_KEY) === 'refus'
    } catch {
      refused = false
    }
  }
  return refused
}

/**
 * Accepte ou refuse la mesure. Le refus est la seule source de vérité côté application :
 * il empêche le chargement du script, et le coupe s'il est déjà là.
 */
export function setAudienceRefused(value: boolean): void {
  refused = value
  try {
    if (value) window.localStorage.setItem(REFUSAL_KEY, 'refus')
    else window.localStorage.removeItem(REFUSAL_KEY)
  } catch {
    // Navigation privée ou stockage plein : le refus ne tiendra pas d'une visite à
    // l'autre, mais il s'applique bien à celle-ci.
  }

  if (value) {
    pending.length = 0
    // `opt_out_capturing()` coupe l'envoi **et** efface le stockage de PostHog : si le
    // script est déjà chargé, il n'y a rien de plus à faire que le lui dire.
    client?.opt_out_capturing()
    return
  }
  // `captureEventName: false` : reprendre la mesure n'est pas un événement à mesurer.
  if (client) client.opt_in_capturing({ captureEventName: false })
  else startAudience()
}

/**
 * Prépare l'envoi des événements. À appeler une fois, après le premier rendu.
 *
 * Le script n'est pas chargé tout de suite : la première seconde d'une arrivée sur cette
 * application est déjà prise par la carte, les tuiles et la demande de géolocalisation.
 * On attend un temps mort, avec un délai de secours — sur mobile, un temps mort peut ne
 * jamais venir.
 */
export function startAudience(): void {
  if (!KEY) {
    if (import.meta.env.DEV) {
      console.info('Mesure d’audience désactivée : VITE_POSTHOG_KEY absente.')
    }
    return
  }
  if (loading || client || broken || audienceRefused()) return
  loading = true

  const start = () => void load()
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 4000 })
  } else {
    window.setTimeout(start, 2000)
  }
}

/**
 * Enregistre un événement. Sans clé, avec un refus, ou si le script n'a pas pu être
 * chargé, l'appel ne fait rien : les points d'appel n'ont donc jamais à se demander si
 * la mesure est active.
 */
export function track(name: AudienceEvent, props?: Props): void {
  if (!KEY || broken || audienceRefused()) return
  if (client) {
    client.capture(name, props)
    return
  }
  if (pending.length < PENDING_MAX) pending.push({ name, props })
}

/**
 * Distance rangée en tranches plutôt qu'en mètres.
 *
 * La question intéressante est « de combien loin les gens se déplacent », pas « à
 * combien de mètres était cette personne » : une distance au mètre, croisée avec la
 * ville déduite de l'adresse IP, désignerait un point de départ.
 */
export function distanceBucket(meters: number | undefined): string | null {
  if (meters === undefined || !Number.isFinite(meters)) return null
  if (meters < 500) return 'moins de 500 m'
  if (meters < 1000) return '500 m à 1 km'
  if (meters < 3000) return '1 à 3 km'
  if (meters < 10_000) return '3 à 10 km'
  return 'plus de 10 km'
}

/** L'application tourne-t-elle installée sur l'écran d'accueil ? */
function standalone(): boolean {
  // iOS ne connaît pas `display-mode: standalone` avant longtemps : il a son propre
  // drapeau, non standard, sur `navigator`.
  const ios = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return Boolean(ios) || window.matchMedia('(display-mode: standalone)').matches
}

async function load(): Promise<void> {
  // Le refus peut être arrivé pendant l'attente du temps mort.
  if (audienceRefused()) {
    loading = false
    return
  }
  try {
    const { posthog } = await import('posthog-js')

    posthog.init(KEY as string, {
      api_host: HOST,
      // Instantané des comportements par défaut : c'est ainsi que PostHog introduit ses
      // changements de version sans casser les intégrations existantes. On prend le plus
      // récent, tout ce qui compte ici étant de toute façon explicite ci-dessous.
      defaults: '2026-08-29',

      // --- Ce qui est mesuré, et rien d'autre --------------------------------------
      // Piège propre à cette application : elle **réécrit son URL à chaque fin de
      // déplacement de carte** (`writeState`, un `replaceState` par `moveend`). Le
      // comportement par défaut ('history_change') compterait donc une page vue par
      // glissement de doigt, et le nombre de visites ne voudrait plus rien dire. Une
      // seule page vue est envoyée, à la main, dans ce fichier.
      capture_pageview: false,
      // Le départ, lui, vaut d'être noté : c'est ce qui donne la durée d'une visite.
      capture_pageleave: true,
      // Aucune capture automatique de clic. Deux raisons, la seconde suffirait : les
      // événements qui répondent aux questions posées sont écrits à la main aux endroits
      // qui les concernent, et la capture automatique enverrait en plus le texte des
      // éléments cliqués — donc des noms d'équipements et des adresses.
      autocapture: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_web_experiments: true,

      // --- Ce qui ne doit pas partir ------------------------------------------------
      // `$current_url` accompagne chaque événement, et l'URL porte la position (`lat`,
      // `lng`) et l'équipement consulté (`e`) : ces paramètres sont remplacés par
      // `<masked>` avant l'envoi. `lon` est là parce que `readState()` l'accepte encore
      // comme synonyme de `lng`.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['lat', 'lng', 'lon', 'e'],
      // Pas de compte, donc personne à identifier : les événements restent anonymes et
      // aucune fiche de personne n'est créée. Le comptage des visiteurs uniques
      // fonctionne quand même — il repose sur un identifiant tiré au sort côté
      // navigateur, pas sur une identité.
      person_profiles: 'identified_only',
      // Cet identifiant vit dans le `localStorage`, comme les filtres, et pas dans un
      // cookie : rien ne repart vers le serveur à chaque requête, et il n'y a pas de
      // cookie à annoncer.
      persistence: 'localStorage',
      // Un « ne pas me pister » annoncé par le navigateur est respecté.
      respect_dnt: true,

      // --- Rien de plus que ce qui est dans le bundle -------------------------------
      // Tout ce que PostHog charge en plus à l'exécution (enregistreur de session,
      // sondages, barre d'outils) est éteint plus haut : interdire le chargement de
      // scripts extérieurs garantit qu'aucune ligne de `script-src` ne sera jamais à
      // ajouter à la CSP. Seul l'envoi des événements sort, d'où la seule ligne ajoutée
      // à `connect-src`.
      disable_external_dependency_loading: true,
      // Aucun drapeau de fonctionnalité n'est utilisé : autant économiser l'appel que
      // PostHog fait au démarrage pour les récupérer.
      advanced_disable_flags: true,
    })

    client = posthog

    // Sur chaque événement, sans rien coûter : l'application est-elle installée ou
    // ouverte dans un navigateur ? C'est la question de fond du projet (« que ça
    // s'installe comme une application »), et elle permet de relire toutes les autres
    // mesures séparément.
    posthog.register({ mode_affichage: standalone() ? 'application' : 'navigateur' })

    posthog.capture('$pageview')
    for (const event of pending) posthog.capture(event.name, event.props)
  } catch {
    // Hors-ligne, requête bloquée, script absent du cache : l'application ne dépend en
    // rien de la mesure, il n'y a donc rien à signaler ni à réessayer.
    broken = true
  } finally {
    pending.length = 0
  }
}
