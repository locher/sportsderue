import { useEffect, useRef } from 'react'
import { CloseIcon } from './Icons'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Contenu épinglé en bas (boutons d'action). */
  footer?: React.ReactNode
}

/**
 * Feuille modale ancrée en bas d'écran : le geste naturel sur mobile.
 * Fermeture par la poignée, le bouton, l'arrière-plan ou la touche Échap.
 */
export function BottomSheet({ open, title, onClose, children, footer }: Props) {
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
        className="absolute inset-0 bg-ink/35 backdrop-blur-[1px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-sheet outline-none transition-transform duration-250 ease-out sm:mb-4 sm:rounded-3xl ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div
          className="shrink-0 cursor-grab touch-none px-4 pt-2 pb-1 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
        </div>

        <div className="flex shrink-0 items-start gap-3 px-4 pb-2">
          <h2 className="min-w-0 flex-1 pt-1 text-lg leading-snug font-semibold text-balance">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-canvas active:bg-line"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
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
