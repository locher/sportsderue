import { useCallback, useRef, useState } from 'react'
import type { LngLat } from '../types'

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

export function useGeolocation() {
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const pending = useRef(false)

  const locate = useCallback((): Promise<UserPosition | null> => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return Promise.resolve(null)
    }
    if (pending.current) return Promise.resolve(null)

    pending.current = true
    setStatus('locating')

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          pending.current = false
          const next: UserPosition = {
            lon: coords.longitude,
            lat: coords.latitude,
            accuracy: coords.accuracy,
            at: timestamp,
          }
          setPosition(next)
          setStatus('ready')
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
  }, [])

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
