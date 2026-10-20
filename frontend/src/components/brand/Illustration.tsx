import type { CSSProperties } from 'react'

/** Illustrations from the design handoff, in `public/illustrations/`. */
export type IllustrationName = 'keke' | 'tanker' | 'gift' | 'jerrycan' | 'drop-hero'

/**
 * Which illustrations have a PNG fallback in the handoff. `jerrycan` and
 * `drop-hero` were delivered as WebP only; every browser we target (Android
 * Chrome, Safari 14+, desktop) supports WebP.
 */
const PNG_FALLBACK: Record<IllustrationName, boolean> = {
  keke: true,
  tanker: true,
  gift: true,
  jerrycan: false,
  'drop-hero': false,
}

interface IllustrationProps {
  name: IllustrationName
  /** Accessible description. Empty (the default) marks the image decorative, as most uses are. */
  alt?: string
  className?: string
  style?: CSSProperties
  width?: number
  height?: number
}

/**
 * File per illustration. `drop-hero` uses `drop-hero-plain.webp`: the handoff
 * image had the slogan "Clean Water Healthier Lives" painted in, and the app
 * must not make water-quality claims (decision 15). The slogan area was
 * filled with the surrounding sky; nothing else in the image changed.
 */
const FILE: Record<IllustrationName, string> = {
  keke: 'keke',
  tanker: 'tanker',
  gift: 'gift',
  jerrycan: 'jerrycan',
  'drop-hero': 'drop-hero-plain',
}

/** A design illustration as `<picture>`: WebP first, PNG fallback where the handoff has one. */
export function Illustration({ name, alt = '', className, style, width, height }: IllustrationProps) {
  const webp = `/illustrations/${FILE[name]}.webp`
  if (!PNG_FALLBACK[name]) {
    return <img src={webp} alt={alt} className={className} style={style} width={width} height={height} />
  }
  return (
    <picture>
      <source type="image/webp" srcSet={webp} />
      <img
        src={`/illustrations/${name}@2x.png`}
        alt={alt}
        className={className}
        style={style}
        width={width}
        height={height}
      />
    </picture>
  )
}
