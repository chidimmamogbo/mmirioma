/** Logo variants shipped in `public/brand/` (official files from the design handoff). */
export type LogoVariant = 'horizontal' | 'horizontal-dark' | 'mark' | 'mark-dark' | 'stacked' | 'stacked-dark'

interface LogoProps {
  variant?: LogoVariant
  /** Rendered height in px. The design uses about 30 on phones and 34 to 48 on desktop. */
  height?: number
  /** Accessible name. Pass an empty string when the logo is decorative. */
  alt?: string
  className?: string
}

/** Intrinsic aspect ratios (width / height) of the logo files, used to reserve space. */
const ASPECT: Record<LogoVariant, number> = {
  horizontal: 622 / 144,
  'horizontal-dark': 622 / 144,
  mark: 199 / 256,
  'mark-dark': 199 / 256,
  stacked: 689 / 512,
  'stacked-dark': 689 / 512,
}

function sources(variant: LogoVariant, ext: 'webp' | 'png'): string {
  const base = '/brand/logo-'
  if (variant === 'horizontal' || variant === 'horizontal-dark') {
    return [1, 2, 3].map((d) => `${base}${variant}@${d}x.${ext} ${d}x`).join(', ')
  }
  if (variant === 'mark' || variant === 'mark-dark') {
    return `${base}${variant}-128.${ext} 1x, ${base}${variant}-256.${ext} 2x, ${base}${variant}-512.${ext} 4x`
  }
  return `${base}${variant}-512.${ext} 1x`
}

/**
 * The official MmiriOma logo, served as WebP with a PNG fallback and the right
 * density for the screen. Never redraw the logo; use this component.
 */
export function Logo({ variant = 'horizontal', height = 30, alt = 'MmiriOma', className }: LogoProps) {
  const fallback = sources(variant, 'png').split(', ').at(-1)!.split(' ')[0]
  return (
    <picture>
      <source type="image/webp" srcSet={sources(variant, 'webp')} />
      <img
        src={fallback}
        srcSet={sources(variant, 'png')}
        alt={alt}
        height={height}
        width={Math.round(height * ASPECT[variant])}
        className={className}
        style={{ height, width: 'auto', display: 'block' }}
      />
    </picture>
  )
}
