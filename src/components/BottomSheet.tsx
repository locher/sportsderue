import { useEffect, useRef } from 'react'
import { CloseIcon } from './Icons'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Contenu épinglé en bas (boutons d'action). */
  footer?: React.ReactNode
  /** Bandeau coloré affiché à la place de l'en-tête blanc standard. */
  hero?: React.ReactNode
}

/**
 * Feuille modale ancrée en bas d'écran : le geste naturel sur mobile.
 * Fermeture par la poignée, le bouton, l'arrière-plan ou la touche Échap.
 */
export function BottomSheet({ open, title, onClose, children, footer, hero }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; offset: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true })
  }, [open])

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { startY: event.clientY, offset: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || !panel.current) return
    const offset = Math.max(0, event.clientY - drag.current.startY)
    drag.current.offset = offset
    panel.current.style.transition = 'none'
    panel.current.style.transform = `translateY(${offset}px)`
  }

  const onPointerUp = () => {
    if (!drag.current || !panel.current) return
    const { offset } = drag.current
    drag.current = null
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    if (offset > 110) onClose()
  }

  return (
    <div
      className={`fixed inset-0 z-40 flex items-end justify-center transition-opacity duration-200 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[34px] bg-white shadow-sheet outline-none transition-transform duration-400 ease-[var(--ease-spring)] sm:mb-4 sm:rounded-[34px] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div
          className="absolute inset-x-0 top-0 z-10 cursor-grab touch-none px-4 pt-2.5 pb-3 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className={`mx-auto h-1.5 w-12 rounded-full ${hero ? 'bg-white/50' : 'bg-line'}`}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className={`springy absolute top-4 right-3 z-10 grid size-9 shrink-0 place-items-center rounded-full ${
            hero ? 'bg-white/25 text-white' : 'bg-canvas text-muted'
          }`}
        >
          <CloseIcon className="size-5" />
        </button>

        {hero ?? (
          <div className="shrink-0 px-4 pt-8 pr-14 pb-2">
            <h2 className="display min-w-0 flex-1 text-[22px] leading-tight text-balance">
              {title}
            </h2>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-line bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
