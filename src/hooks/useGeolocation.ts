import { useCallback, useRef, useState } from 'react'
import type { LngLat } from '../types'

export type GeolocationStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error'

export interface UserPosition extends LngLat {
  accuracy: number
  at: number
}

const MESSAGES: Record<GeolocationStatus, string | null> = {
  idle: null,
  locating: null,
  ready: null,
  denied:
    'Géolocalisation refusée. Autorisez-la dans les réglages de votre navigateur ou recherchez une ville.',
  unavailable: 'Votre appareil ne permet pas la géolocalisation. Recherchez une ville.',
  error: 'Position introuvable pour le moment. Réessayez ou recherchez une ville.',
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
          setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
          resolve(null)
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      )
    })
  }, [])

  return {
    position,
    status,
    message: MESSAGES[status],
    locate,
    isLocating: status === 'locating',
  }
}
