import type { ComponentType, ReactNode } from 'react'
import { Illustration, type IllustrationName } from '../components/brand/Illustration'
import { Logo, type LogoVariant } from '../components/brand/Logo'
import type { IconProps } from '../components/icons/Icon'
import * as icons from '../components/icons/icons'
import { formatNaira } from '../lib/format/money'

/*
 * Temporary Phase 1 review page: shows the ported tokens, font, assets, icons
 * and motion so they can be checked against the design handoff. It is replaced
 * by the app router in Phase 2 and must not ship.
 */

const COLORS = [
  'primary', 'primary-dark', 'ink', 'mute', 'line', 'canvas', 'sky', 'mint',
  'navy', 'deep-blue', 'ocean', 'turquoise', 'gold', 'gold-ink', 'gold-tint',
  'green', 'green-bg', 'amber', 'amber-bg', 'red', 'red-bg', 'violet', 'violet-bg',
  'teal-ink', 'teal-bg', 'gray', 'gray-bg', 'slate', 'card-line', 'input-line',
]

const LOGOS: LogoVariant[] = ['horizontal', 'horizontal-dark', 'mark', 'mark-dark', 'stacked', 'stacked-dark']
const ILLUSTRATIONS: IllustrationName[] = ['keke', 'tanker', 'gift', 'jerrycan', 'drop-hero']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-card-line bg-white p-4 shadow-card">
      <h2 className="mb-3 text-section font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

/** Phase 1 foundation preview (temporary, see file comment). */
export function FoundationPreview() {
  const iconEntries = Object.entries(icons) as [string, ComponentType<IconProps>][]
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-gutter">
      <header className="rise-1 flex flex-wrap items-center gap-4">
        <Logo height={34} />
        <div>
          <h1 className="text-title font-extrabold">Phase 1 foundation preview</h1>
          <p className="text-sub text-mute">Temporary page. Tokens, font, assets, icons and motion.</p>
        </div>
      </header>

      <Section title="Type: Plus Jakarta Sans 400 to 800">
        <div className="flex flex-col gap-1">
          {[400, 500, 600, 700, 800].map((w) => (
            <p key={w} style={{ fontWeight: w }} className="text-section">
              {w} · Water at your gate, without the stress · ọ ụ ị ṅ · {formatNaira(650000)}
            </p>
          ))}
          <p className="text-big font-extrabold">{formatNaira(4520000)}</p>
          <p className="text-title font-extrabold">Screen title 24 / 800</p>
          <p className="text-body">Body 14 / 1.45: Clean water poured straight into your tank.</p>
          <p className="text-caption text-mute">Caption 12.5 · muted</p>
          <span className="w-fit rounded-sample bg-gold-tint px-1.5 py-0.5 text-sample font-extrabold tracking-[0.4px] text-gold-ink">
            SAMPLE PRICES
          </span>
        </div>
      </Section>

      <Section title="Colours">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {COLORS.map((c) => (
            <div key={c} className="flex items-center gap-2 text-chip font-bold">
              <span
                className="size-8 shrink-0 rounded-input border border-line"
                style={{ background: `var(--color-${c})` }}
              />
              {c}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Logos">
        <div className="flex flex-wrap items-end gap-6">
          {LOGOS.map((v) => (
            <div key={v} className={`rounded-input p-2 ${v.endsWith('dark') ? 'bg-ink' : ''}`}>
              <Logo variant={v} height={v.startsWith('horizontal') ? 30 : 64} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Illustrations (with design motion)">
        <div className="flex flex-wrap items-end gap-6">
          {ILLUSTRATIONS.map((n) => (
            <Illustration
              key={n}
              name={n}
              alt={n}
              className={n === 'keke' || n === 'tanker' ? 'animate-drive' : 'animate-float'}
              style={{ height: 96, width: 'auto' }}
            />
          ))}
        </div>
      </Section>

      <Section title={`Icons (${iconEntries.length}, exact design paths)`}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
          {iconEntries.map(([name, IconComponent]) => (
            <div key={name} className="flex flex-col items-center gap-1 text-center text-[11px] text-mute">
              <span className="flex size-11 items-center justify-center rounded-icon bg-sky text-primary">
                <IconComponent size={22} />
              </span>
              {name.replace(/Icon$/, '')}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Motion (stops with reduce motion)">
        <div className="flex flex-wrap items-center gap-8">
          <span className="relative flex size-6 items-center justify-center">
            <span className="animate-ping absolute size-6 rounded-full bg-red-solid" />
            <span className="relative size-3 rounded-full bg-red-solid" />
          </span>
          <span className="glow size-2.5 rounded-full bg-primary" aria-label="glow" />
          <span className="blink flex h-[54px] w-11 items-center justify-center rounded-input border-[1.5px] border-primary bg-sky text-[22px] font-extrabold">
            4
          </span>
          <span className="h-3 w-40 overflow-hidden rounded-sample bg-gold-tint">
            <span className="shine animate-grow-x block h-full w-[83%] rounded-sample bg-[#E5A21A]" />
          </span>
          <svg width="120" height="20" aria-hidden="true">
            <path d="M0 10 H120" stroke="var(--color-primary)" strokeWidth="4" className="route-flow" />
          </svg>
          <span className="animate-pop flex size-12 items-center justify-center rounded-full bg-green-bg text-green">
            <icons.CheckIcon size={26} strokeWidth={3} />
          </span>
          <span className="animate-sway inline-block origin-top">
            <icons.BellIcon size={24} />
          </span>
        </div>
      </Section>
    </main>
  )
}
