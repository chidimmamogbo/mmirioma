import { lazy, Suspense, useEffect, useState } from 'react'
import { cx } from '../../lib/cx'
import { WHATSAPP_GREETING, whatsappLink } from '../../lib/whatsapp'
import { ArrowUpIcon, WhatsAppIcon } from './icons'
import { Kicker } from './MarketingParts'
import { useWhatsappNumber } from './queries'

/** Scroll distance (px) after which "Back to top" appears: about one screen on a phone. */
const SHOW_BACK_TO_TOP_AFTER = 600

/**
 * Floating buttons in the bottom-right corner of the public pages: "Back to
 * top" (once the page is scrolled) above "Chat on WhatsApp" (always).
 * The WhatsApp label shows from 640 px; on phones the button is the icon
 * with an accessible name, so it does not cover the page.
 */
export function FloatingActions() {
  const whatsapp = useWhatsappNumber()
  const [showTop, setShowTop] = useState(false)

  // Show "Back to top" only after a screenful of scrolling. Passive listener:
  // it never blocks scrolling; the cleanup removes it when the page closes.
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > SHOW_BACK_TO_TOP_AFTER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function backToTop() {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })
    // Keyboard users continue from the top of the page, not from this button.
    document.querySelector<HTMLElement>('header a')?.focus({ preventScroll: true })
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {showTop && (
        <button
          type="button"
          onClick={backToTop}
          aria-label="Back to top"
          className="rise-1 pointer-events-auto flex size-12 cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-solid border-input-line bg-white text-ink shadow-[0_8px_24px_rgba(10,37,64,0.16)] transition-colors duration-150 hover:border-primary hover:bg-mk-panel hover:text-primary"
        >
          <ArrowUpIcon />
        </button>
      )}
      <a
        href={whatsappLink(whatsapp, WHATSAPP_GREETING)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with MmiriOma on WhatsApp (opens WhatsApp)"
        className="pointer-events-auto flex min-h-14 min-w-14 items-center justify-center gap-2.5 rounded-[18px] bg-[#1DA851] px-4 text-[15px] font-bold text-white no-underline shadow-[0_10px_28px_rgba(16,120,60,0.35)] transition-colors duration-150 hover:bg-[#178A43] hover:text-white"
      >
        <WhatsAppIcon size={26} />
        <span className="hidden sm:inline">Chat on WhatsApp</span>
      </a>
    </div>
  )
}

/** The form brings React Hook Form and Zod, so it loads as its own chunk after the page shows. */
const NewsletterForm = lazy(() => import('./NewsletterForm').then((m) => ({ default: m.NewsletterForm })))

/**
 * Newsletter sign-up, the last section before the footer on every public
 * page. The heading and text show at once; the one-field form follows a
 * moment later (a field-sized placeholder holds its place meanwhile).
 *
 * @param overlap - Landing page only: rounded bottom corners that sit over the
 *   footer, as the section above the footer did in the design.
 */
export function NewsletterSignup({ overlap = false }: { overlap?: boolean }) {
  return (
    <section aria-labelledby="newsletter-title" className={cx('bg-white', overlap && 'relative z-[1] rounded-b-[36px]')}>
      <div className="mk-wrap pb-20">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-x-12 gap-y-6 rounded-[28px] bg-mk-panel px-[clamp(20px,4vw,56px)] py-[clamp(32px,4vw,52px)]">
          <div className="flex flex-col gap-3">
            <Kicker>Newsletter</Kicker>
            <h2 id="newsletter-title" className="m-0 font-display text-[clamp(28px,3.2vw,38px)] leading-[1.15] font-extrabold tracking-[-1px] text-ink">
              Hear first when we reach your area
            </h2>
            <p className="m-0 text-[16px] leading-[1.6] text-slate">New delivery areas and offers, by email. Unsubscribe any time.</p>
          </div>
          <Suspense fallback={<div aria-hidden="true" className="skeleton h-[120px] rounded-2xl bg-white" />}>
            <NewsletterForm />
          </Suspense>
        </div>
      </div>
    </section>
  )
}
