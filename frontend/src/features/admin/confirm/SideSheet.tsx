import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../../components/icons/icons'

/**
 * The 720 px side sheet of the confirm design (admin-confirm-order.md, Q1;
 * upstream C1 decision 1), full screen on a phone, with the buttons fixed at
 * the bottom. Behaves like `ConfirmDialog`: rendered in a portal, focus moves
 * in and returns on close, Tab stays inside, Escape closes unless `locked`,
 * and the page behind does not scroll.
 */
export function SideSheet({
  title,
  sub,
  footer,
  locked = false,
  onClose,
  children,
}: {
  title: string
  sub?: ReactNode
  footer: ReactNode
  /** A request is running or a dialog is open on top: Escape, Tab and the backdrop are left alone. */
  locked?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const id = useId()
  const panel = useRef<HTMLDivElement>(null)
  const latest = useRef({ locked, onClose })
  useEffect(() => {
    latest.current = { locked, onClose }
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('button, [href], input, textarea, select')?.focus()
    return () => {
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Locked: a request runs, or a dialog on top owns the keys.
      if (latest.current.locked) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        latest.current.onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea, select')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(10,37,64,.45)]" onClick={() => !locked && onClose()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="relative flex h-full w-full flex-col bg-canvas text-ink shadow-[0_24px_60px_rgba(10,37,64,0.3)] sm:w-[720px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="m-0 text-[20px] font-extrabold">
              {title}
            </h2>
            {sub && <div className="text-label text-mute">{sub}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={locked}
            onClick={onClose}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-icon border-0 bg-transparent text-ink disabled:cursor-default disabled:opacity-50"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        <div className="flex shrink-0 justify-end gap-2.5 border-t border-line bg-white px-4 pt-3.5 pb-[max(18px,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}
