import { useEffect, useState } from 'react'

/**
 * Hauteur réellement visible. `100dvh` suffit en CSS, mais les calculs de position
 * de la feuille glissante ont besoin de la valeur en pixels.
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.visualViewport?.height ?? window.innerHeight,
  )

  useEffect(() => {
    const update = () => {
      setHeight(window.visualViewport?.height ?? window.innerHeight)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return height
}
