import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { whatsappLink } from '../../lib/whatsapp'
import { LANDING_FAQS, OBJECTIONS, ORDER_CTA, SERVICE_AREAS } from './content'
import {
  ArrowRightIcon,
  BigPinIcon,
  CardIcon,
  ChevronIcon,
  DottedArrowIcon,
  DownloadArrowIcon,
  DropCheckIcon,
  DropFilledIcon,
  PinIcon,
  ShieldCheckIcon,
  TruckIcon,
  WhatsAppIcon,
} from './icons'
import { InstallAppButton, Kicker, MarketingFooter, MarketingHeader, Oma, Pic, SectionHead } from './MarketingParts'
import { useWhatsappNumber } from './queries'
import { FloatingActions, NewsletterSignup } from './SiteExtras'
import { useMarketingPage } from './useMarketingPage'

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2.5 rounded-[10px] bg-primary text-center font-bold text-white no-underline transition-colors duration-150 hover:bg-primary-dark hover:text-white'
const OUTLINE_BUTTON =
  'inline-flex items-center justify-center gap-2.5 rounded-[10px] border-[1.5px] border-solid border-primary bg-white text-center font-bold text-primary no-underline transition-colors duration-150 hover:bg-mk-panel hover:text-primary-dark'

/**
 * Public landing page at `/` (design/MmiriOma-landing-handoff, "Landing").
 * Shown to everyone, signed in or not, because it is the page we share; the
 * installed apps open at `/app` instead (decision Q1 of round 2).
 *
 * Order of sections (owner's copy brief, 2026-10-21): what you get and the
 * main button above the fold, benefits before features, worries answered
 * just before the closing button, then the newsletter and footer.
 */
export function Landing() {
  useMarketingPage(
    'MmiriOma | Water delivery in Enugu',
    'Order water by keke or tanker in Enugu. We pour it into your drums or tank, and you see the price before you confirm.',
  )
  return (
    <div className="mk-page min-w-0 overflow-x-clip bg-white font-marketing text-[16px] leading-normal text-ink">
      <MarketingHeader current="home" />
      <main>
        <Hero />
        <div className="bg-white pt-10 pb-[72px]">
          <div className="mk-wrap flex flex-col gap-8">
            <Benefits />
            <HowItWorks />
            <DeliveryOptions />
          </div>
        </div>
        <ForDrivers />
        <InstallSection />
        <AreasAndFaqs />
        <BeforeYouOrder />
        <NewsletterSignup overlap />
      </main>
      <MarketingFooter variant="full" />
      <FloatingActions />
    </div>
  )
}

function Badge({ icon, children, navy = false }: { icon: ReactNode; children: ReactNode; navy?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2.5 text-[13px] leading-[1.3] font-semibold', navy ? 'text-white' : 'text-ink')}>
      <span
        className={cx(
          'inline-flex size-[42px] shrink-0 items-center justify-center rounded-full',
          navy ? 'bg-mk-mint text-mk-drivers' : 'bg-mk-badge text-mk-badge-icon',
        )}
      >
        {icon}
      </span>
      {children}
    </div>
  )
}

function Hero() {
  return (
    <section id="top" className="mk-hero">
      <div className="mk-wrap mk-hero-grid w-full">
        <div className="mk-hero-text flex flex-col gap-[22px]">
          <Kicker>Water delivery in Enugu</Kicker>
          <h1 className="m-0 font-display text-[clamp(46px,6.2vw,84px)] leading-[0.98] font-extrabold tracking-[-2px] text-ink">
            Water at
            <br />
            <span className="text-mk-teal">your gate</span>
          </h1>
          <p className="m-0 max-w-[460px] text-[19px] leading-[1.55] text-mk-lead">
            Order on your phone. We bring the water by keke or tanker and pour it into your drums or tank.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <Link to="/order" className={cx(PRIMARY_BUTTON, 'min-h-[54px] px-[26px] text-[16px]')}>
              <DropFilledIcon />
              {ORDER_CTA}
              <ArrowRightIcon />
            </Link>
            <Link to="/#download" className={cx(OUTLINE_BUTTON, 'min-h-[54px] px-[26px] text-[16px]')}>
              <DownloadArrowIcon />
              Install the app
            </Link>
          </div>
          <div className="grid max-w-[560px] grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 pt-3.5">
            <Badge icon={<DropCheckIcon />}>Poured into your drums or tank</Badge>
            <Badge icon={<CardIcon />}>Full price before you confirm</Badge>
            <Badge icon={<ShieldCheckIcon />}>Done only when you give your code</Badge>
          </div>
        </div>
        <Pic
          name="hero-vehicles"
          fallback="jpg"
          width={1410}
          height={969}
          eager
          className="mk-hero-side"
          alt="A blue MmiriOma keke loaded with water cans beside a white MmiriOma water tanker in front of a modern house"
        />
      </div>
    </section>
  )
}

function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-10 rounded-[28px] bg-mk-panel px-[clamp(16px,2.6vw,36px)] py-[clamp(32px,4vw,56px)]">
      {children}
    </section>
  )
}

const BENEFITS: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <TruckIcon size={22} />, title: 'No more carrying water', text: 'We bring it to your gate. You never lift a jerrycan.' },
  { icon: <DropCheckIcon size={22} />, title: 'Poured in for you', text: 'Keke riders pour into your drums. Tanker drivers pump into your tank.' },
  { icon: <CardIcon size={22} />, title: 'No price surprises', text: 'You see the full price before you confirm. Your order keeps that price.' },
  { icon: <ShieldCheckIcon size={22} />, title: 'You confirm the delivery', text: 'The rider can only finish once you give your delivery code.' },
]

/** Benefits come before the features (how it works, sizes): what you get, then how. */
function Benefits() {
  return (
    <section id="benefits" aria-labelledby="benefits-title" className="flex flex-col gap-8 py-6">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Kicker>Why MmiriOma</Kicker>
        <h2 id="benefits-title" className="m-0 font-display text-[clamp(30px,3.8vw,44px)] leading-[1.15] font-extrabold tracking-[-1px] text-ink">
          Your water, sorted from your phone
        </h2>
        <p className="m-0 max-w-[560px] text-[17px] leading-[1.6] text-slate">You order. We bring the water and pour it in. You check it, then give your code.</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-4 p-0">
        {BENEFITS.map((b) => (
          <li key={b.title} className="flex flex-col gap-2.5 rounded-[20px] border border-solid border-line bg-white p-6">
            <span className="inline-flex size-11 items-center justify-center rounded-[12px] bg-mk-badge text-mk-badge-icon">{b.icon}</span>
            <h3 className="m-0 font-display text-[19px] font-bold text-ink">{b.title}</h3>
            <p className="m-0 text-[15px] leading-[1.55] text-slate">{b.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

const STEPS: { img: string; w: number; h: number; circle: string; title: string; text: string }[] = [
  { img: 'step-order', w: 82, h: 122, circle: 'bg-primary', title: 'Order', text: 'Pick keke or tanker, the size and your address.' },
  { img: 'step-deliver', w: 145, h: 92, circle: 'bg-primary', title: 'We bring it', text: 'A rider collects the water and heads to you.' },
  { img: 'step-pour', w: 115, h: 122, circle: 'bg-mk-step3', title: 'We pour it', text: 'Into your drums, or your ground or overhead tank.' },
  { img: 'step-code', w: 87, h: 108, circle: 'bg-mk-step4', title: 'Give your code', text: 'Share your delivery code once all the water is in.' },
]

function HowItWorks() {
  return (
    <Panel id="how">
      <SectionHead
        kicker="How it works"
        title={
          <>
            How <Oma /> works
          </>
        }
        lead="Four steps from order to a full tank."
      />
      <div className="mk-steps">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative flex flex-col gap-3.5 rounded-[20px] bg-white px-[26px] py-8 shadow-[0_8px_28px_rgba(15,60,120,0.07)]">
            <Pic name={s.img} width={s.w} height={s.h} className="block h-16 w-auto self-center" />
            <span className={cx('mt-2 inline-flex size-[30px] items-center justify-center rounded-full text-[14px] font-bold text-white', s.circle)}>{i + 1}</span>
            <h3 className="m-0 font-display text-[20px] font-bold text-ink">{s.title}</h3>
            <p className="m-0 text-[15px] leading-[1.6] text-slate">{s.text}</p>
            {i < STEPS.length - 1 && (
              <span className="mk-step-arrow absolute top-1/2 right-[-27px] text-mk-arrow" aria-hidden="true">
                <DottedArrowIcon />
              </span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function SubCard({ title, wide = false, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-5', wide ? 'flex-[1.6_1_260px]' : 'flex-[1_1_180px]')}>
      <p className="m-0 text-[15px] font-bold text-ink">{title}</p>
      {children}
    </div>
  )
}

function Tiles({ tiles, tone }: { tiles: [string, string][]; tone: 'keke' | 'tanker' }) {
  return (
    <div className="grid flex-auto grid-cols-4 gap-2">
      {tiles.map(([n, unit]) => (
        <div
          key={n}
          className={cx('flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-xl', tone === 'keke' ? 'bg-mk-panel' : 'bg-mk-tanker-tile')}
        >
          <span className={cx('font-display font-bold text-ink', n === 'Custom' ? 'text-[15px]' : tone === 'keke' ? 'text-[19px]' : 'text-[18px]')}>{n}</span>
          <span className="text-[12px] text-mute">{unit}</span>
        </div>
      ))}
    </div>
  )
}

function Pictured({ items }: { items: { img: string; w: number; h: number; height: string; label: string }[] }) {
  return (
    <div className="grid flex-auto grid-cols-2 items-end gap-2.5">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center gap-2.5">
          <Pic name={it.img} width={it.w} height={it.h} className={cx('w-auto', it.height)} />
          <span className="text-center text-[14px] leading-[1.25] font-bold text-ink">{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function OptionCard({
  tone,
  title,
  text,
  image,
  children,
}: {
  tone: 'keke' | 'tanker'
  title: string
  text: string
  image: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cx('flex flex-col gap-5 rounded-3xl p-[clamp(18px,2vw,24px)]', tone === 'keke' ? 'bg-mk-keke' : 'bg-mk-tanker')}>
      <div className="grid min-h-[190px] grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] items-center gap-3">
        <div className="flex flex-col gap-2.5">
          <h3 className={cx('m-0 font-display text-[30px] font-extrabold', tone === 'keke' ? 'text-mk-keke-title' : 'text-mk-tanker-title')}>{title}</h3>
          <p className="m-0 text-[16px] leading-[1.55] text-mk-lead">{text}</p>
        </div>
        {image}
      </div>
      <div className="flex flex-auto flex-wrap gap-3.5">{children}</div>
    </div>
  )
}

/** Sizes only, no prices: prices come from the server inside the app (FR-022). */
function DeliveryOptions() {
  return (
    <Panel id="options">
      <SectionHead kicker="Keke or tanker" title="Pick the size that fits" lead="Keke for drums at home or work. Tanker to fill a whole tank." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] gap-7">
        <OptionCard
          tone="keke"
          title="Keke Delivery"
          text="For homes, offices and small shops."
          image={<Pic name="keke" width={473} height={314} alt="Blue MmiriOma keke carrying stacked water cans" className="block h-auto w-full max-w-[320px] justify-self-end" />}
        >
          <SubCard title="Can sizes">
            <Pictured
              items={[
                { img: 'can-25l', w: 85, h: 125, height: 'h-[60px]', label: '25 Litres' },
                { img: 'can-50l', w: 87, h: 126, height: 'h-[68px]', label: '50 Litres' },
              ]}
            />
          </SubCard>
          <SubCard title="How many" wide>
            <Tiles
              tone="keke"
              tiles={[
                ['12', 'Gallons'],
                ['24', 'Gallons'],
                ['30', 'Gallons'],
                ['60', 'Gallons'],
              ]}
            />
          </SubCard>
        </OptionCard>
        <OptionCard
          tone="tanker"
          title="Tanker Delivery"
          text="For big homes, businesses and estates."
          image={<Pic name="tanker" width={544} height={295} alt="White MmiriOma water tanker truck" className="block h-auto w-full max-w-[330px] justify-self-end" />}
        >
          <SubCard title="Tank type">
            <Pictured
              items={[
                { img: 'tank-ground', w: 88, h: 112, height: 'h-16', label: 'Ground Tank' },
                { img: 'tank-overhead', w: 87, h: 129, height: 'h-[68px]', label: 'Overhead Tank' },
              ]}
            />
          </SubCard>
          <SubCard title="Tanker sizes" wide>
            <Tiles
              tone="tanker"
              tiles={[
                ['500', 'Gallons'],
                ['750', 'Gallons'],
                ['1,000', 'Gallons'],
                ['Custom', 'Size'],
              ]}
            />
          </SubCard>
        </OptionCard>
      </div>
    </Panel>
  )
}

const APPROVAL: [string, string][] = [
  ['Apply in the driver app', 'Say if you ride a keke or drive a tanker.'],
  ['Upload your papers', "Valid ID, driver's licence and vehicle papers."],
  ['We check you', 'Our team reviews your details and your vehicle.'],
  ['Start taking orders', 'Go online and accept orders near you.'],
]

function ForDrivers() {
  return (
    <section id="drivers" className="bg-mk-navy text-white">
      <div className="mk-drivers">
        <div className="mk-wrap mk-drivers-grid w-full">
          <div className="mk-drivers-text flex flex-col gap-5">
            <Kicker navy>For riders and drivers</Kicker>
            <h2 className="m-0 font-display text-[clamp(36px,4.4vw,58px)] leading-[1.02] font-extrabold tracking-[-1.5px] text-white">
              Deliver water.
              <br />
              <span className="text-mk-mint">Get paid per trip.</span>
            </h2>
            <p className="m-0 text-[17px] leading-[1.6] text-mk-on-navy">
              Use your own keke or tanker. Take orders near you and see what you earn on every delivery.
            </p>
            <Link to="/partner/signup" className={cx(PRIMARY_BUTTON, 'min-h-[54px] self-start px-7 text-[16px]')}>
              Apply to deliver
              <ArrowRightIcon />
            </Link>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5 pt-2">
              <Badge navy icon={<CardIcon />}>
                Pay for every delivery
              </Badge>
              <Badge navy icon={<TruckIcon />}>
                Keke or tanker
              </Badge>
              <Badge navy icon={<ShieldCheckIcon />}>
                Go online when you choose
              </Badge>
            </div>
          </div>
          <Pic
            name="drivers-banner"
            fallback="jpg"
            width={2202}
            height={879}
            className="mk-drivers-photo"
            alt="Smiling MmiriOma driver in a branded polo and cap standing in front of a water tanker"
          />
        </div>
      </div>
      <div className="mk-wrap flex flex-col gap-6 pt-12 pb-14">
        <h3 className="m-0 font-display text-[22px] font-bold text-white">How approval works</h3>
        <ol className="mk-approval m-0 list-none p-0">
          {APPROVAL.map(([title, text], i) => (
            <li key={title} className="flex items-start gap-3.5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-mk-mint font-display text-[16px] font-bold text-mk-navy">{i + 1}</span>
              <div className="flex flex-col gap-1">
                <p className="m-0 text-[16px] font-bold text-white">{title}</p>
                <p className="m-0 text-[14px] leading-[1.5] text-mk-approval">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const INSTALL_BUTTON = cx(PRIMARY_BUTTON, 'mt-2 min-h-[50px] self-start px-[22px] text-[15px]')

function AppCard({ img, w, h, alt, title, text, button }: { img: string; w: number; h: number; alt: string; title: string; text: string; button: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] items-end gap-x-6 gap-y-3 rounded-3xl bg-white px-7 shadow-[0_8px_28px_rgba(15,60,120,0.06)]">
      <Pic name={img} width={w} height={h} alt={alt} className="mt-[-36px] block h-auto w-full max-w-[210px] justify-self-center" />
      <div className="flex flex-col gap-3 self-center pt-7 pb-8">
        <h3 className="m-0 font-display text-[22px] font-bold text-ink">{title}</h3>
        <p className="m-0 text-[15px] leading-[1.6] text-slate">{text}</p>
        {button}
      </div>
    </div>
  )
}

function InstallSection() {
  return (
    <section id="download" className="bg-mk-panel">
      <div className="mk-wrap flex flex-col gap-14 py-[88px]">
        <SectionHead
          kicker="No app store needed"
          title={
            <>
              Put <Oma /> on your phone
            </>
          }
          lead="Install it straight from your browser. It opens from your home screen like any app."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] gap-7">
          <AppCard
            img="phone-customer"
            w={341}
            h={402}
            alt="Phone showing the MmiriOma customer app"
            title="For customers"
            text="Order water, follow each step of your delivery and earn points."
            button={
              <InstallAppButton app="customer" className={INSTALL_BUTTON}>
                Install the customer app
                <ArrowRightIcon size={15} />
              </InstallAppButton>
            }
          />
          <AppCard
            img="phone-driver"
            w={352}
            h={374}
            alt="Phone showing the MmiriOma driver dashboard"
            title="For riders and drivers"
            text="Get orders, deliver them and see what you have earned."
            button={
              <InstallAppButton app="partner" className={INSTALL_BUTTON}>
                Install the driver app
                <ArrowRightIcon size={15} />
              </InstallAppButton>
            }
          />
        </div>
      </div>
    </section>
  )
}

const TEXT_LINK = 'inline-flex min-h-11 items-center gap-1.5 text-[15px] font-bold text-primary no-underline hover:text-primary-dark'

/** Service areas and FAQs. The "Our Partners" strip is left out until real partners are agreed (decision Q4). */
function AreasAndFaqs() {
  const whatsapp = useWhatsappNumber()
  return (
    <section className="bg-white">
      <div className="mk-wrap py-20">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-12">
          <div id="areas" className="flex flex-col gap-[18px]">
            <Kicker>Where we deliver</Kicker>
            <h2 className="m-0 font-display text-[clamp(30px,3.4vw,40px)] font-extrabold tracking-[-1px] text-ink">Our service areas</h2>
            <p className="m-0 max-w-[460px] text-[16px] leading-[1.6] text-slate">
              The areas we plan to serve in Enugu. <b className="text-ink">Sample list:</b> our first zone is still being confirmed.
            </p>
            <ul aria-label="Service areas (sample)" className="m-0 flex list-none flex-wrap gap-2.5 p-0 pt-1">
              {SERVICE_AREAS.map((a) => (
                <li key={a} className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-mk-chip px-4 text-[15px] font-semibold text-ink">
                  <PinIcon className="text-ink" />
                  {a}
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex flex-wrap items-center gap-4 rounded-[18px] bg-mk-chip px-6 py-[22px]">
              <BigPinIcon className="shrink-0" />
              <div className="min-w-0 flex-[1_1_200px]">
                <p className="m-0 text-[16px] font-bold text-ink">Not on the list?</p>
                <p className="mt-0.5 mb-0 text-[14px] text-slate">Ask us. We are adding new areas.</p>
              </div>
              <a
                href={whatsappLink(whatsapp, 'Hello MmiriOma, do you deliver to my area?')}
                target="_blank"
                rel="noopener noreferrer"
                className={TEXT_LINK}
              >
                Check your area on WhatsApp
                <ArrowRightIcon size={15} />
              </a>
            </div>
          </div>
          <div id="faq" className="mk-split-divider flex flex-col gap-[18px]">
            <Kicker>Questions</Kicker>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="m-0 font-display text-[clamp(30px,3.4vw,40px)] font-extrabold tracking-[-1px] text-ink">FAQs</h2>
              <Link to="/faq" className={TEXT_LINK}>
                Read all answers
                <ArrowRightIcon size={15} />
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {LANDING_FAQS.map((f) => (
                <details key={f.q} className="group rounded-xl border border-solid border-line px-[18px] transition-colors duration-150 hover:border-mk-faq-open">
                  <summary className="flex min-h-[54px] items-center justify-between gap-4 text-[15px] font-medium text-ink">
                    {f.q}
                    <ChevronIcon className="shrink-0 text-ink transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="mt-0 mb-4 text-[15px] leading-[1.65] text-slate">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The common worries, answered right before the closing button (owner's copy brief). */
function BeforeYouOrder() {
  const whatsapp = useWhatsappNumber()
  return (
    <section id="before-you-order" aria-labelledby="before-title" className="bg-white">
      <div className="mk-wrap pb-20">
        <div className="flex flex-col gap-10 rounded-[28px] bg-mk-navy px-[clamp(20px,4vw,56px)] py-[clamp(36px,5vw,64px)] text-white">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <Kicker navy>Before you order</Kicker>
            <h2 id="before-title" className="m-0 font-display text-[clamp(30px,3.8vw,44px)] leading-[1.15] font-extrabold tracking-[-1px] text-white">
              Worried about something? Read this.
            </h2>
          </div>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4 p-0">
            {OBJECTIONS.map((o) => (
              <li key={o.q} className="flex flex-col gap-2 rounded-[18px] bg-white/8 p-6">
                <h3 className="m-0 text-[17px] leading-[1.35] font-bold text-white">{o.q}</h3>
                <p className="m-0 text-[15px] leading-[1.55] text-mk-on-navy">{o.a}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <Link to="/order" className={cx(PRIMARY_BUTTON, 'min-h-[54px] px-[28px] text-[16px]')}>
              <DropFilledIcon />
              {ORDER_CTA}
              <ArrowRightIcon />
            </Link>
            <a
              href={whatsappLink(whatsapp, 'Hello MmiriOma, I have a question before I order.')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[54px] items-center justify-center gap-2.5 rounded-[10px] border-[1.5px] border-solid border-white/60 px-[26px] text-center text-[16px] font-bold text-white no-underline transition-colors duration-150 hover:border-white hover:bg-white/10 hover:text-white"
            >
              <WhatsAppIcon size={20} />
              Ask us on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
