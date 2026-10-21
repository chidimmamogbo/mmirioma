import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'
import { CONTACT } from './content'
import { ArrowLeftIcon } from './icons'
import { BrandLogo } from './MarketingParts'
import { FloatingActions, NewsletterSignup } from './SiteExtras'
import { useMarketingPage } from './useMarketingPage'

/*
 * Terms of Service (/terms) and Privacy Policy (/privacy). Copy from
 * design/MmiriOma-landing-handoff/content/*.md. Two lines in the Terms are
 * reworded to match the honesty rules (no "sealed cans" or "clean and sealed
 * for every trip"); the legal text still needs review before launch
 * (docs/design/landing-v1.md, "Open items").
 */

interface Section {
  id: string
  title: string
  body: ReactNode
  /** The final "Contact us" section sits in a tinted box. */
  boxed?: boolean
  /** A second anchor on the heading (Privacy section 9 is also `#cookies`). */
  headingId?: string
}

const Email = () => <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
const Phone = () => <a href={CONTACT.phoneHref}>{CONTACT.phoneLabel}</a>
const ADDRESS = 'Hackathon Innovation Lab, ECCIMA Building, opposite All Saints Church, Garden Avenue, GRA, Enugu, Enugu State, Nigeria.'

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex flex-col gap-2 pl-[22px]">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

const TERMS: Section[] = [
  {
    id: 't1',
    title: '1. About these terms',
    body: (
      <p>
        These Terms of Service ("Terms") apply to the MmiriOma website, customer app and driver app (together, the "Service"), operated by
        MmiriOma ("we", "us") in Enugu State, Nigeria. By creating an account or placing an order, you agree to these Terms and to our{' '}
        <Link to="/privacy">Privacy Policy</Link>. If you don't agree, please don't use the Service.
      </p>
    ),
  },
  {
    id: 't2',
    title: '2. Your account',
    body: (
      <p>
        You must be at least 18 years old to create an account. Give us accurate details, including your phone number and delivery addresses,
        and keep them up to date. You are responsible for activity on your account, so keep your login details private and tell us straight away
        if you think someone else has used it.
      </p>
    ),
  },
  {
    id: 't3',
    title: '3. Orders and pricing',
    body: (
      <>
        <p>
          You can order by keke (our cans poured into your containers) or by tanker (pumped into your ground or overhead tank). The app shows the
          total price before you confirm. Prices can depend on volume, delivery type and distance, and may change from time to time, but the
          price you confirm is the price you pay for that order.
        </p>
        <p>
          An order is accepted once a rider or driver is assigned. We may decline or cancel an order if your address is outside our service
          areas, the details are incomplete, or delivery is not safely possible.
        </p>
      </>
    ),
  },
  {
    id: 't4',
    title: '4. Delivery',
    body: (
      <>
        <p>
          Delivery times shown in the app are estimates. Traffic, weather and road conditions can cause delays, and we'll keep you updated in the
          app.
        </p>
        <List
          items={[
            'Make sure someone can receive the water and that the rider can safely reach your gate, drums or tank.',
            'For keke orders, provide clean containers. The rider pours the water and takes our empty cans back. The cans remain our property.',
            'For tanker orders, tell us whether your tank is ground or overhead and make sure there is room for the hose to reach it.',
            "If the rider can't complete delivery because of access problems on your side, a return or waiting fee may apply. The app will show it before it is charged.",
          ]}
        />
      </>
    ),
  },
  {
    id: 't5',
    title: '5. The delivery code',
    body: (
      <>
        <p>
          Each order comes with a one-time delivery code. Share it with the rider only after the full quantity has been poured. Giving the code
          confirms that you received the order as described. If anything is wrong, don't share the code. Report it in the app instead so we can
          sort it out.
        </p>
        <p>If you share the code with someone else to receive the water for you, their confirmation counts as yours.</p>
      </>
    ),
  },
  {
    id: 't6',
    title: '6. Payment',
    body: (
      <p>
        All payments are processed securely by Paystack, using the payment options Paystack shows at checkout. We do not store your full card
        details. All prices are in Nigerian Naira (₦).
      </p>
    ),
  },
  {
    id: 't7',
    title: '7. Cancellations and refund requests',
    body: (
      <>
        <p>You can cancel for free before a rider or driver is assigned. After that, a cancellation fee may apply to cover the trip.</p>
        <p>
          We do not give cash refunds. If you request a refund, for example because an order was cancelled or a delivery was short or not made,
          our team will review your request. If it is approved, the amount is converted to MmiriOma points in your account, which you can use
          toward your next order.
        </p>
      </>
    ),
  },
  {
    id: 't8',
    title: '8. Water quality',
    body: (
      <p>
        We supply borehole water. Once water is poured into your containers or tank, its condition also depends on how clean they are, so please
        clean and cover them regularly. If you have a concern about the water you received, report it in the app before sharing your delivery
        code, or within 24 hours of delivery.
      </p>
    ),
  },
  {
    id: 't9',
    title: '9. Riders and drivers',
    body: (
      <p>
        Riders and drivers must apply through the driver app, submit valid identification, a driver's licence and vehicle papers, and be approved
        by our team before taking orders. They must handle water hygienically, treat customers with respect and follow traffic laws. Additional
        rider and driver terms, including how earnings are paid, are shown in the driver app at sign-up.
      </p>
    ),
  },
  {
    id: 't10',
    title: '10. Acceptable use',
    body: (
      <p>
        Don't use the Service to place fake orders, harass riders or customers, misuse delivery codes, or interfere with the apps. We may suspend
        or close accounts that break these Terms.
      </p>
    ),
  },
  {
    id: 't11',
    title: '11. Liability',
    body: (
      <p>
        We work hard to deliver on time and in full, but the Service is provided as available. To the extent the law allows, our liability for
        any order is limited to the amount you paid for that order. Nothing in these Terms limits rights you have under Nigerian consumer
        protection law, including the Federal Competition and Consumer Protection Act.
      </p>
    ),
  },
  {
    id: 't12',
    title: '12. Changes and governing law',
    body: (
      <p>
        We may update these Terms as the Service grows. When we make important changes, we'll tell you in the app before they take effect. These
        Terms are governed by the laws of the Federal Republic of Nigeria, and disputes will be handled by the courts in Enugu State.
      </p>
    ),
  },
  {
    id: 't13',
    title: '13. Contact us',
    boxed: true,
    body: (
      <p>
        Questions about these Terms? Email <Email /> or call <Phone />. Our address is {ADDRESS}
      </p>
    ),
  },
]

function CollectBox({ title, items, tint }: { title: string; items: string[]; tint: string }) {
  return (
    <div className={cx('box-border min-w-0 flex-[1_1_260px] rounded-2xl p-5', tint)}>
      <div className="mb-2 font-bold text-ink">{title}</div>
      <ul className="m-0 pl-5 text-[15px] leading-[1.7]">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

const RIGHTS = ['Access your data', 'Correct it', 'Delete it', 'Get a copy', 'Object to processing', 'Withdraw consent']

const PRIVACY: Section[] = [
  {
    id: 'p1',
    title: '1. Who we are',
    body: (
      <p>
        MmiriOma is a water delivery service based in Enugu State, Nigeria. We are the data controller for personal data collected through our
        website, customer app and driver app. This policy follows the Nigeria Data Protection Act 2023 (NDPA). See also our{' '}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: 'p2',
    title: '2. What we collect',
    body: (
      <>
        <div className="flex flex-wrap gap-4">
          <CollectBox
            title="From customers"
            tint="bg-[#F4F9FF]"
            items={[
              'Name, phone number and email',
              'Delivery addresses and landmarks',
              'Order details: type, size, quantity, tank type',
              'Payment records (not full card numbers)',
              'Messages and ratings you send us',
            ]}
          />
          <CollectBox
            title="From riders and drivers"
            tint="bg-[#EFFAF7]"
            items={[
              'Name, phone number and photo',
              "ID, driver's licence and vehicle papers",
              'Bank details for payouts',
              'Live location while online',
              'Delivery history and earnings',
            ]}
          />
        </div>
        <p>We also collect basic device and usage information, such as app version, device type and error logs, to keep the apps working well.</p>
        <p>If you sign up for our newsletter, we keep your email address to send it to you until you unsubscribe.</p>
      </>
    ),
  },
  {
    id: 'p3',
    title: '3. How we use it',
    body: (
      <>
        <List
          items={[
            'To take your order, assign a rider or driver and deliver your water.',
            'To generate and check one-time delivery codes so only the right person confirms a delivery.',
            'To process payments, refund requests, MmiriOma points and rider payouts.',
            'To verify riders and drivers before they are approved.',
            'To send order updates and answer support requests.',
            'To prevent fraud, keep the Service safe and meet our legal obligations.',
            'To improve routes, delivery times and the apps, using combined or anonymised data where we can.',
          ]}
        />
        <p>
          We rely on performing our contract with you, our legitimate interests in running a safe service, your consent (for example, marketing
          messages) and legal obligations as our lawful bases under the NDPA.
        </p>
      </>
    ),
  },
  {
    id: 'p4',
    title: '4. Location data',
    body: (
      <p>
        Customers can share their location to set a delivery pin faster. Riders and drivers share their live location only while they are online
        in the driver app, so we can match nearby orders and show customers where their delivery is. You can turn location access off in your
        device settings, but some features will stop working.
      </p>
    ),
  },
  {
    id: 'p5',
    title: '5. Who we share it with',
    body: (
      <>
        <p>We do not sell your personal data. We share only what is needed:</p>
        <List
          items={[
            'Riders and drivers see your first name, delivery address and order details for the order they accept.',
            "Customers see their assigned rider's first name, photo, vehicle type and live location during delivery.",
            'Service providers such as our payment processor Paystack, SMS providers and cloud hosting, under contracts that protect your data.',
            "Authorities, when the law requires it or to protect someone's safety.",
          ]}
        />
      </>
    ),
  },
  {
    id: 'p6',
    title: '6. How long we keep it',
    body: (
      <p>
        We keep your records, including account details, order and payment history and rider verification documents, for as long as you have an
        account with us. If you delete your account, we keep these records for one year after deletion and then delete them, unless the law
        requires us to keep something longer.
      </p>
    ),
  },
  {
    id: 'p7',
    title: '7. How we protect it',
    body: (
      <p>
        We use encrypted connections, access controls so staff only see what their role needs, and secure storage for documents and passwords. No
        system is perfectly secure, so if we ever have a breach that puts you at risk, we'll tell you and the Nigeria Data Protection Commission as
        the law requires.
      </p>
    ),
  },
  {
    id: 'p8',
    title: '8. Your rights',
    body: (
      <>
        <p>Under the NDPA you can ask to:</p>
        <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
          {RIGHTS.map((r) => (
            <li
              key={r}
              className="inline-flex min-h-10 items-center rounded-full border border-solid border-[#DCE8F5] bg-[#F4F9FF] px-3.5 text-[14px] font-semibold text-ink"
            >
              {r}
            </li>
          ))}
        </ul>
        <p>
          Email <Email /> to make a request. We'll reply within 30 days. If you're not happy with our answer, you can complain to the Nigeria Data
          Protection Commission.
        </p>
      </>
    ),
  },
  {
    id: 'p9',
    headingId: 'cookies',
    title: '9. App storage and cookies',
    body: (
      <p>
        Our installable web apps store small amounts of data on your device, such as your login session and saved preferences, so the app opens
        quickly and works offline where possible. We don't use advertising cookies. Clearing your browser data removes this storage and signs you
        out.
      </p>
    ),
  },
  {
    id: 'p10',
    title: '10. Children',
    body: (
      <p>
        MmiriOma accounts are for people aged 18 and over. We don't knowingly collect data from children. If you think a child has created an
        account, contact us and we'll remove it.
      </p>
    ),
  },
  {
    id: 'p11',
    title: '11. Changes to this policy',
    body: (
      <p>
        We'll update this page when our practices change and show the new date at the top. For important changes, we'll also let you know in the
        app.
      </p>
    ),
  },
  {
    id: 'p12',
    title: '12. Contact us',
    boxed: true,
    body: (
      <p>
        For privacy questions or requests, email <Email /> or call <Phone />. Data Protection Officer: Nnamdi Ileh. Address: {ADDRESS}
      </p>
    ),
  },
]

/**
 * Shared layout of the legal pages: simple header with "Back to home", a
 * tinted hero, an "On this page" box linking to every section, the article,
 * and a compact footer.
 */
function LegalPage({
  kind,
  title,
  intro,
  sections,
}: {
  kind: 'terms' | 'privacy'
  title: string
  intro: string
  sections: Section[]
}) {
  useMarketingPage(`${title} | MmiriOma`, intro)
  const terms = kind === 'terms'
  return (
    <div className="mk-page min-w-0 overflow-x-clip bg-white font-marketing text-[16px] leading-normal text-ink">
      <header className="sticky top-0 z-30 border-0 border-b border-solid border-[#E3EDF7] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto box-border flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5">
          <Link to="/" aria-label="MmiriOma home" className="flex min-h-11 min-w-0 items-center no-underline">
            <BrandLogo className="h-auto w-[190px] max-w-full" />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-solid border-input-line px-[18px] text-center text-[15px] font-semibold whitespace-nowrap text-ink no-underline transition-colors duration-150 hover:border-primary hover:bg-mk-panel hover:text-ink"
          >
            <ArrowLeftIcon />
            Back to home
          </Link>
        </div>
      </header>
      <main>
        <section className={terms ? 'bg-[#EEF6FF]' : 'bg-[#EFFAF7]'}>
          <div className="mx-auto box-border flex max-w-[1200px] flex-col gap-3.5 px-6 pt-16 pb-14">
            <p className={cx('m-0 text-[13px] font-bold tracking-[2px]', terms ? 'text-primary' : 'text-[#0B6A5F]')}>LEGAL</p>
            <h1 className="m-0 font-display text-[clamp(40px,5vw,60px)] font-extrabold tracking-[-1.5px] text-ink">{title}</h1>
            <p className="m-0 max-w-[640px] text-[17px] leading-[1.6] text-[#3A4F67]">{intro}</p>
            <p className="mt-1.5 mb-0 text-[14px] font-semibold text-slate">Effective date: 1 November 2026</p>
          </div>
        </section>
        <section>
          <div className="mx-auto box-border flex max-w-[1200px] flex-wrap items-start gap-14 px-6 pt-14 pb-24">
            <nav
              aria-label="On this page"
              className="box-border flex max-w-[300px] flex-[1_1_240px] flex-col gap-2.5 rounded-[18px] border border-solid border-[#DCE8F5] bg-[#F4F9FF] p-6 text-[15px]"
            >
              <p className="m-0 mb-1 font-bold text-ink">On this page</p>
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="text-slate no-underline hover:text-ink">
                  {s.title}
                </a>
              ))}
            </nav>
            <article className="flex max-w-[760px] min-w-0 flex-[999_1_560px] flex-col gap-10 text-[16px] leading-[1.75] text-slate [&_p]:m-0">
              {sections.map((s) => (
                <div
                  key={s.id}
                  id={s.id}
                  className={cx('flex flex-col gap-3', s.boxed && 'rounded-[18px] border border-solid border-[#DCE8F5] bg-[#F4F9FF] p-7')}
                >
                  <h2 id={s.headingId} className="m-0 font-display text-[26px] font-bold text-ink">
                    {s.title}
                  </h2>
                  {s.body}
                </div>
              ))}
            </article>
          </div>
        </section>
        <NewsletterSignup />
      </main>
      <footer className="bg-mk-navy text-mk-foot-text">
        <div className="mx-auto box-border flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[14px]">
          <span className="flex flex-wrap items-center gap-4 text-mk-foot-muted">
            <BrandLogo dark className="h-8" />© 2026 MmiriOma. All rights reserved.
          </span>
          <nav aria-label="Legal" className="flex flex-wrap gap-6">
            <Link to="/" className="text-mk-foot-text no-underline hover:text-white">
              Home
            </Link>
            <Link to="/faq" className="text-mk-foot-text no-underline hover:text-white">
              FAQs
            </Link>
            <Link
              to="/terms"
              aria-current={terms ? 'page' : undefined}
              className={cx('no-underline hover:text-white', terms ? 'font-bold text-white' : 'text-mk-foot-text')}
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              aria-current={!terms ? 'page' : undefined}
              className={cx('no-underline hover:text-white', !terms ? 'font-bold text-white' : 'text-mk-foot-text')}
            >
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
      <FloatingActions />
    </div>
  )
}

/** Terms of Service (`/terms`). */
export function TermsPage() {
  return (
    <LegalPage
      kind="terms"
      title="Terms of Service"
      intro="The rules for using MmiriOma to order, deliver and receive water. Please read them before you place an order or sign up as a rider or driver."
      sections={TERMS}
    />
  )
}

/** Privacy Policy (`/privacy`). Section 9's heading is also `#cookies`, for the footer's "Cookie Policy" link. */
export function PrivacyPage() {
  return (
    <LegalPage
      kind="privacy"
      title="Privacy Policy"
      intro="What we collect when you use MmiriOma, why we need it and the choices you have. We only ask for what it takes to get water to your gate."
      sections={PRIVACY}
    />
  )
}
