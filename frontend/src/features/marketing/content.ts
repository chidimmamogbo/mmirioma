/**
 * Copy for the public pages (design/MmiriOma-landing-handoff). Kept here so
 * the landing page, FAQ page and tests read the same words.
 *
 * Changed from the design (docs/design/landing-v1.md, "Differences"):
 * quality claims and promises the app does not keep (sealed cans, clean and
 * safe water, live tracking, picking a delivery time) are reworded or
 * removed, and the service areas are labelled as a sample list.
 */

/** Support contacts from the design (README "Link and button map"). */
export const CONTACT = {
  email: 'support@mmirioma.com',
  phoneHref: 'tel:+2348133774902',
  phoneLabel: '0813 377 4902',
  place: 'Enugu, Nigeria',
} as const

/** Label of every "order" button on the public pages: a verb and the outcome (owner's copy brief). */
export const ORDER_CTA = 'Get water delivered'

/** Header and footer "Quick Links": sections of the landing page, plus the FAQ page. */
export const NAV_LINKS: { label: string; to: string }[] = [
  { label: 'Home', to: '/' },
  { label: 'How It Works', to: '/#how' },
  { label: 'Our Services', to: '/#options' },
  { label: 'For Drivers', to: '/#drivers' },
  { label: 'FAQs', to: '/faq' },
  { label: 'Service Areas', to: '/#areas' },
]

/** Planned areas from the design. A sample until the pilot zone is confirmed (PRD §13.1, decision Q5). */
export const SERVICE_AREAS = [
  'GRA',
  'Ogui',
  'Independence Layout',
  'Trans-Ekulu',
  'Abakpa',
  'New Haven',
  'Thinkers Corner',
  'Anyika',
  'Emene',
  'Uwani',
  'and nearby areas',
]

export const FAQ_CATEGORIES = ['Ordering', 'Delivery', 'Delivery code', 'Payments', 'Riders & drivers', 'Account & safety'] as const
export type FaqCategory = (typeof FAQ_CATEGORIES)[number]

export interface Faq {
  cat: FaqCategory
  q: string
  a: string
}

/** The FAQ page's questions (content/faqs.json, with the changes listed above). */
export const FAQS: Faq[] = [
  {
    cat: 'Ordering',
    q: 'How do I place an order?',
    a: 'Open the customer app, choose Keke or Tanker, pick your size and quantity, then confirm your delivery address. You will see the full price before you confirm.',
  },
  {
    cat: 'Ordering',
    q: 'What is the difference between Keke and Tanker delivery?',
    a: 'Keke delivery is for smaller orders. The rider brings our 25 or 50 litre cans, pours them into your drums or containers and takes the empty cans back for refill. Tanker delivery is for bulk orders of 500 gallons and above, pumped straight into your ground or overhead tank.',
  },
  {
    cat: 'Ordering',
    q: 'Can I order a custom tanker quantity?',
    a: 'Yes. Choose Custom Size under Available Capacities and enter the quantity you need. We will confirm availability and price in the app.',
  },
  {
    cat: 'Delivery',
    q: 'Do you pour the water for tanker deliveries?',
    a: 'Yes. Tell us whether you have a ground or overhead tank when you order, and the driver will pump the water straight into it.',
  },
  {
    cat: 'Delivery',
    q: 'How long does delivery take?',
    a: 'It depends on demand and distance. The app shows each step of your delivery, and an arrival time once your rider has one.',
  },
  {
    cat: 'Delivery',
    q: 'Which areas do you deliver to?',
    a: 'We are confirming our first service areas in Enugu. The areas on our home page are a sample list for now. Contact us to check yours.',
  },
  {
    cat: 'Delivery',
    q: 'What if I am not at home when the rider arrives?',
    a: 'Share your delivery code with someone you trust at the gate, like a family member or gateman, so they can receive the water for you.',
  },
  {
    cat: 'Delivery code',
    q: 'How do I receive my delivery code (OTP)?',
    a: 'Your one-time code appears in the app once a rider is on the way. It is unique to that order.',
  },
  {
    cat: 'Delivery code',
    q: 'When should I give the rider my code?',
    a: 'Only after the full quantity has been poured into your containers or tank. Giving the code confirms the delivery is complete.',
  },
  {
    cat: 'Delivery code',
    q: 'What if something is wrong with my delivery?',
    a: 'Do not share your code. Report the problem in the app straight away and our support team will sort it out.',
  },
  {
    cat: 'Payments',
    q: 'What payment methods do you accept?',
    a: 'We take payments through Paystack. You pay securely in the app when you confirm your order.',
  },
  {
    cat: 'Payments',
    q: 'Can I get a refund?',
    a: 'We do not give cash refunds. If you request one, for example because a delivery was short or not made, our team reviews it. If approved, your payment is converted to MmiriOma points that you can use on your next order.',
  },
  {
    cat: 'Riders & drivers',
    q: 'How do I become a rider or driver?',
    a: 'Install the driver app, apply with a valid ID, driver’s licence and vehicle papers, and wait for our team to verify you. Once approved, go online and start accepting orders.',
  },
  {
    cat: 'Riders & drivers',
    q: 'Can I use my own keke or tanker?',
    a: 'Yes. Tell us your vehicle type when you apply. Our team checks the vehicle as part of approval.',
  },
  {
    cat: 'Riders & drivers',
    q: 'How do I get paid?',
    a: 'Your earnings for each completed delivery show in the driver app, and payouts go to the bank account you add in your profile.',
  },
  {
    cat: 'Account & safety',
    q: 'Where does your water come from?',
    a: 'We supply borehole water. Please keep your own drums and tanks clean and covered, because the water’s condition after delivery also depends on them.',
  },
  {
    cat: 'Account & safety',
    q: 'Do I need to download the app from an app store?',
    a: 'No. MmiriOma is a web app. Open the link on your phone or computer and add it to your home screen with the Install button (on iPhone: Share, then Add to Home Screen).',
  },
]

/** The landing page's questions, in the design's shorter wording. "Not at home" moved to OBJECTIONS. */
export const LANDING_FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I place an order?',
    a: "Open the customer app, choose Keke or Tanker, pick your size and quantity, then confirm your delivery address. You'll see the price before you confirm.",
  },
  {
    q: 'What is the difference between Keke and Tanker delivery?',
    a: 'Keke delivery is for smaller orders. The rider brings our cans, pours them into your drums or containers and takes the empty cans back. Tanker delivery is for bulk orders and pumps straight into your tank.',
  },
  {
    q: 'Do you pour the water for tanker deliveries?',
    a: 'Yes. Tell us whether you have a ground or overhead tank when you order, and the driver will pump the water straight into it.',
  },
  {
    q: 'How do I receive my delivery code (OTP)?',
    a: 'Your code shows in the app once a rider is on the way. Only share it after your water has been poured.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We take payments through Paystack. You pay securely in the app when you confirm your order.',
  },
  {
    q: 'Can I order a custom tanker quantity?',
    a: 'Yes. Choose Custom Size and enter the quantity you need. We will confirm availability and price in the app.',
  },
  {
    q: 'How do I become a rider or driver?',
    a: 'Install the driver app, apply with your documents and wait for our team to verify you. Once approved, go online and start accepting orders.',
  },
]

/**
 * The worries people have before a first order, answered right above the
 * landing page's closing button. Every answer restates a rule the app keeps:
 * refunds as points (FAQ "Can I get a refund?"), the order keeps its quote
 * (FR-024), custom tanker sizes priced by the team (FR-021), the delivery code
 * (FAQ "Delivery code"), and the sample areas list (decision Q5).
 */
export const OBJECTIONS: { q: string; a: string }[] = [
  {
    q: 'What if I get less water than I paid for?',
    a: 'Do not give your delivery code. Report it in the app. If our team confirms the problem, you get your payment back as MmiriOma points.',
  },
  {
    q: 'Can the price change after I order?',
    a: 'No. You see the full price before you confirm, and your order keeps it. Custom tanker sizes get a price from our team first.',
  },
  {
    q: "What if I'm not at home?",
    a: 'Give your delivery code to someone you trust at the gate. They can receive the water for you.',
  },
  {
    q: 'Do you deliver to my area?',
    a: 'We are confirming our first areas in Enugu. Ask us on WhatsApp before you order.',
  },
]

export type FaqFilter = FaqCategory | 'All'

/** True when `search` appears in the question or answer (case-insensitive). Empty search matches all. */
function matches(faq: Faq, search: string): boolean {
  const s = search.trim().toLowerCase()
  return s === '' || faq.q.toLowerCase().includes(s) || faq.a.toLowerCase().includes(s)
}

/**
 * The FAQ page's list and category counts for a search and category.
 * Counts follow the search, so a category shows how many of its questions match.
 */
export function filterFaqs(search: string, category: FaqFilter, faqs: Faq[] = FAQS) {
  const found = faqs.filter((f) => matches(f, search))
  const counts = { All: found.length } as Record<FaqFilter, number>
  for (const c of FAQ_CATEGORIES) counts[c] = found.filter((f) => f.cat === c).length
  return { list: category === 'All' ? found : found.filter((f) => f.cat === category), counts }
}
