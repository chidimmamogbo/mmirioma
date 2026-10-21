/**
 * Icons drawn in the marketing design (design/MmiriOma-landing-handoff),
 * copied path for path so the pages match the screenshots. All are
 * decorative (`aria-hidden`); the text next to them carries the meaning.
 */
import type { CSSProperties } from 'react'

interface Props {
  size?: number
  className?: string
  style?: CSSProperties
}

const line = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function MenuBarsIcon({ size = 22, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.2} aria-hidden="true" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function DropFilledIcon({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2.5s-7 7.6-7 12.2a7 7 0 0 0 14 0C19 10.1 12 2.5 12 2.5Z" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.4} aria-hidden="true" className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

export function DownloadArrowIcon({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.2} aria-hidden="true" className={className}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

export function DropCheckIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2} aria-hidden="true" className={className}>
      <path d="M12 3s-5 5.5-5 8.8a5 5 0 0 0 10 0C17 8.5 12 3 12 3Z" />
      <path d="m9.5 12 1.8 1.8 3.2-3.3" />
    </svg>
  )
}

export function TruckIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2} aria-hidden="true" className={className}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

export function HouseIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2} aria-hidden="true" className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  )
}

/** Dotted arrow between the "How it works" step cards. */
export function DottedArrowIcon({ className, style }: Props) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className} style={style}>
      <path d="M1 6h2M6 6h2M11 6h8M15 2l4 4-4 4" />
    </svg>
  )
}

export function CardIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2} aria-hidden="true" className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </svg>
  )
}

export function ShieldCheckIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2} aria-hidden="true" className={className}>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

/** Small filled map pin (area chips, footer). */
export function PinIcon({ size = 15, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  )
}

/** Large blue pin in the "Don't see your area?" box. */
export function BigPinIcon({ className }: Props) {
  return (
    <svg width="34" height="40" viewBox="0 0 24 28" aria-hidden="true" className={className}>
      <path d="M12 1a10 10 0 0 0-10 10c0 7.5 10 16 10 16s10-8.5 10-16A10 10 0 0 0 12 1Z" fill="var(--color-primary)" />
      <circle cx="12" cy="11" r="3.6" fill="#FFFFFF" />
    </svg>
  )
}

/** FAQ accordion chevron; rotates when its `<details>` is open (`group-open`). */
export function ChevronIcon({ className }: Props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...line} strokeWidth={2.4} aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function SearchIcon({ className }: Props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function MailIcon({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function PhoneIcon({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z" />
    </svg>
  )
}

export function ArrowLeftIcon({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.4} aria-hidden="true" className={className}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  )
}

/** WhatsApp's logo (Simple Icons, CC0), for the chat button. Not in the design. */
export function WhatsAppIcon({ size = 24, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.41" />
    </svg>
  )
}

export function ArrowUpIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.4} aria-hidden="true" className={className}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  )
}

export function CheckCircleIcon({ size = 20, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth={2.2} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </svg>
  )
}
