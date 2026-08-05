import { useCallback, useEffect, useRef, useState } from 'react'
import type { LngLat } from '../types'
import { distanceMeters } from '../lib/geo'

export type GeolocationStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'error'

export interface UserPosition extends LngLat {
  accuracy: number
  at: number
}

/**
 * En dessous de ce déplacement, une nouvelle mesure est du bruit et non un pas.
 *
 * Un appareil immobile « danse » de quelques mètres d'une mesure à l'autre, et tout
 * l'affichage descend de cette valeur : marqueur déplacé, carte recentrée si elle suit,
 * distances recalculées et liste retriée. Huit mètres, c'est en dessous de la précision
 * courante en ville et au-dessus du frémissement.
 */
const MOVE_EPSILON_M = 8

/** Passé ce délai sans mesure, le suivi s'est tu : la position est à redemander. */
const FRESH_MS = 15_000

// iOS renvoie PERMISSION_DENIED sans jamais afficher de demande quand le blocage
// vient du système (service de localisation coupé, Safari sur « Refuser ») : la page
// ne peut rien y faire, seul le message peut dire où regarder. Et l'endroit n'est
// pas le même que sur ordinateur, d'où ce test.
export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS 13+ se déclare « MacIntel » : le tactile est le seul discriminant.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const MESSAGES: Record<GeolocationStatus, string | null> = {
  idle: null,
  locating: null,
  ready: null,
  denied: IS_IOS
    ? 'Position refusée par Safari. Si aucune demande n’est apparue, vérifiez Réglages → Confidentialité et sécurité → Service de localisation (activé, Safari sur « Lors de l’utilisation »), puis Réglages → Apps → Safari → Localisation sur « Demander ».'
    : 'Géolocalisation refusée. Autorisez-la dans les réglages de votre navigateur ou recherchez une ville.',
  unavailable: 'Votre appareil ne permet pas la géolocalisation. Recherchez une ville.',
  timeout: 'La position met trop de temps à arriver. Réessayez ou recherchez une ville.',
  error: 'Position introuvable pour le moment. Réessayez ou recherchez une ville.',
}

function statusForError(error: GeolocationPositionError): GeolocationStatus {
  if (error.code === error.PERMISSION_DENIED) return 'denied'
  if (error.code === error.TIMEOUT) return 'timeout'
  return 'error'
}

/**
 * Position de l'utilisateur, **suivie en continu**.
 *
 * Deux mécanismes, et ils ne font pas le même travail : `getCurrentPosition` obtient le
 * premier point — c'est lui qui déclenche la demande d'autorisation et qui porte les
 * messages d'erreur — puis `watchPosition` prend le relais et fait avancer le marqueur
 * quand on marche. Un point figé était le comportement signalé comme gênant : on se
 * déplace, la carte reste sur le point de départ.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const pending = useRef(false)

  /** Identifiant du suivi en cours côté navigateur, `null` s'il ne tourne pas. */
  const watchId = useRef<number | null>(null)
  /** Le suivi *doit* tourner : il n'est en pause que parce que la page est masquée. */
  const tracking = useRef(false)
  /** Dernière position retenue, et date de la dernière mesure reçue (même écartée). */
  const current = useRef<UserPosition | null>(null)
  const lastFixAt = useRef(0)

  /** Retient une mesure si elle apporte quelque chose, et renvoie la position à jour. */
  const accept = useCallback((coords: GeolocationCoordinates, timestamp: number) => {
    lastFixAt.current = Date.now()
    const next: UserPosition = {
      lon: coords.longitude,
      lat: coords.latitude,
      accuracy: coords.accuracy,
      at: timestamp,
    }
    const previous = current.current
    if (previous && distanceMeters(previous, next) < MOVE_EPSILON_M) return previous
    current.current = next
    setPosition(next)
    return next
  }, [])

  const pauseWatch = useCallback(() => {
    if (watchId.current === null) return
    navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  /**
   * Démarre le suivi. Appelé seulement après un premier point obtenu : l'autorisation
   * est alors acquise, et c'est la demande unique qui a affiché la demande native.
   */
  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) return
    tracking.current = true
    // Page masquée : rien à montrer et de la batterie à brûler. Le retour au premier
    // plan relance le suivi (voir l'effet plus bas).
    if (watchId.current !== null || document.visibilityState === 'hidden') return

    watchId.current = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        accept(coords, timestamp)
        setStatus('ready')
      },
      (error) => {
        // Une mesure manquée (tunnel, immeuble, ciel bouché) n'est pas une panne : le
        // dernier point reste juste, et le navigateur reprendra de lui-même. Seul le
        // refus est définitif — l'autorisation peut être retirée en cours de route.
        if (error.code !== error.PERMISSION_DENIED) return
        tracking.current = false
        pauseWatch()
        setStatus('denied')
      },
      // Haute précision indispensable ici : sans elle la position vient du Wi-Fi ou du
      // réseau et ne bouge pas d'un pas à l'autre, le suivi n'aurait rien à suivre.
      // `maximumAge: 0` interdit de resservir un point déjà connu. Pas de `timeout` :
      // il ferait remonter une erreur à chaque mesure manquée alors qu'on a déjà un
      // point valable. Le coût en batterie est assumé, la mise en pause le borne.
      { enableHighAccuracy: true, maximumAge: 0 },
    )
  }, [accept, pauseWatch])

  // Le suivi ne tourne que page visible. Au retour au premier plan, une mesure repart
  // aussitôt : c'est le cas courant d'une application installée, rouverte depuis
  // l'arrière-plan des kilomètres plus loin.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!tracking.current) return
      if (document.visibilityState === 'visible') startWatch()
      else pauseWatch()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      pauseWatch()
    }
  }, [startWatch, pauseWatch])

  const locate = useCallback((): Promise<UserPosition | null> => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return Promise.resolve(null)
    }
    // Le suivi tourne et vient de mesurer : la position connue est la bonne, il n'y a
    // rien à redemander. Une tape sur « Me localiser » ne sert alors qu'à recentrer.
    if (current.current && Date.now() - lastFixAt.current < FRESH_MS) {
      startWatch()
      return Promise.resolve(current.current)
    }
    if (pending.current) return Promise.resolve(null)

    pending.current = true
    setStatus('locating')

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          pending.current = false
          const next = accept(coords, timestamp)
          setStatus('ready')
          // Le point de départ obtenu, le suivi prend le relais.
          startWatch()
          resolve(next)
        },
        (error) => {
          pending.current = false
          setStatus(statusForError(error))
          resolve(null)
        },
        // Le temps passé sur la demande d'autorisation est compté dans `timeout` :
        // 10 s suffisaient rarement à lire la feuille iOS et à répondre, et un
        // TIMEOUT arrivait alors que la personne allait accepter.
        { enableHighAccuracy: false, timeout: 20_000, maximumAge: 60_000 },
      )
    })
  }, [accept, startWatch])

  return {
    position,
    status,
    message: MESSAGES[status],
    locate,
    isLocating: status === 'locating',
    // Un nouvel essai n'a de sens que si l'appareil sait se localiser. Il vaut
    // surtout pour un refus : l'appel automatique du démarrage n'a pas de geste
    // utilisateur derrière lui, alors qu'une tape en fournit un — c'est ce que
    // WebKit attend pour afficher sa demande.
    canRetry: status === 'denied' || status === 'timeout' || status === 'error',
  }
}
