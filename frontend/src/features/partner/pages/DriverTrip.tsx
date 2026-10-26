/**
 * The tanker trip after accepting: go to the station (`t-refill`, a full-screen
 * map), confirm the gallons loaded (`t-loading`, FR-034) and go to the
 * customer (`t-customer`). The code step and the done screen follow. Each
 * screen checks the job's stage through `JobStep`.
 */
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapBadge, MapFrame, MapPin, TankGauge, TankerCustomerMapArt, TankerRefillMapArt } from '../../../components/art/Art'
import { Illustration } from '../../../components/brand/Illustration'
import { CameraIcon, CheckIcon, ChevronLeftIcon, NavigationIcon, PhoneIcon, StationDoorIcon, TankStandIcon, TurnRightIcon } from '../../../components/icons/icons'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { Avatar } from '../../../components/ui/Avatar'
import { Button, ButtonLink, ExternalButton } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { IconBadge, ScreenHeading } from '../../../components/ui/Content'
import { IconLink } from '../../../components/ui/IconButton'
import { Notice } from '../../../components/ui/Notice'
import { shortReference } from '../../../domain/orders'
import { describeQuantity, gallonsFromLitres, litresFromGallons } from '../../../domain/quantity'
import type { PartnerJob } from '../../../domain/partner'
import { errorMessage } from '../../../lib/api/errorMessage'
import { JobStep } from '../components/JobStep'
import { directionsUrl } from '../maps'
import { usePartnerApp } from '../partnerContext'
import { readPickupPhoto } from '../photo'
import { useConfirmPickup, usePartnerProfile } from '../queries'

/** Green buttons of the tanker trip screens. */
const GREEN_BUTTON = 'bg-[#15803D] shadow-[0_10px_22px_rgba(21,128,61,0.3)] hover:bg-[#14532D]'
const GREEN_ALT = 'h-[46px] bg-[#E7F7EE] text-[#14532D] hover:text-[#14532D]'

/**
 * Gallons the order needs: its tank size; the ordered litres when the backend
 * does not send the tank yet (#21; 1 local gallon = 4 L exactly); or the
 * driver's tank for a custom quote.
 */
function targetGallons(job: PartnerJob, tank: number | null | undefined): number {
  if (job.choice === null) return gallonsFromLitres(job.quantity_litres)
  return (job.choice.delivery_type === 'tanker' ? job.choice.tank_size_gallons : null) ?? tank ?? 1000
}

/** Step 1: go to the refill station on a full-screen map (`t-refill`). */
export function DriverRefill() {
  const { base } = usePartnerApp()
  return (
    <JobStep stage="accepted">
      {(j) => (
        <MobileShell>
          <div className="absolute inset-0 bg-map">
            <TankerRefillMapArt />
            <Illustration
              name="tanker"
              alt="Your tanker"
              className="animate-drive absolute top-[70.4%] left-[17.9%] w-[110px] drop-shadow-[0_8px_10px_rgba(10,37,64,0.25)]"
            />
            <div
              aria-hidden="true"
              className="animate-float absolute top-[22%] left-[71.8%] flex size-11 items-center justify-center rounded-icon bg-[#15803D] text-white shadow-[0_8px_16px_rgba(21,128,61,0.4)]"
            >
              <StationDoorIcon size={22} />
            </div>
          </div>
          <div className="relative z-[2] flex items-center gap-2.5 px-3.5 py-3">
            <IconLink to={base} label="Back" className="bg-white shadow-[0_4px_12px_rgba(10,37,64,0.15)]">
              <ChevronLeftIcon size={22} strokeWidth={2.4} roundJoin={false} />
            </IconLink>
            {/* Design: "Turn right in 300 m onto Ogui Road". The app has no live directions, so it names the destination (decision 14). */}
            <div className="rise-1 flex flex-1 items-center gap-2.5 rounded-option bg-[#15803D] px-3.5 py-2.5 text-white shadow-[0_10px_22px_rgba(21,128,61,0.35)]">
              <TurnRightIcon size={26} strokeWidth={2.4} />
              <div>
                <div className="text-[16px] font-extrabold">Head to {j.station.name}</div>
                <div className="text-caption text-[#DCFCE7]">{j.station.address}</div>
              </div>
            </div>
          </div>
          <div className="rise-2 absolute right-0 bottom-0 left-0 z-[2] flex flex-col gap-3 rounded-t-[26px] bg-white px-[18px] pt-2.5 pb-5 shadow-[0_-12px_30px_rgba(10,37,64,0.15)]">
            <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-[3px] bg-line" />
            <div className="flex items-center justify-between gap-2.5">
              <div>
                <div className="text-chip font-bold text-[#15803D]">GO TO REFILL STATION · STEP 1 OF 2</div>
                <h1 className="m-0 text-[19px] font-extrabold">{j.station.name}</h1>
                <div className="text-caption text-mute">
                  Load {describeQuantity(litresFromGallons(targetGallons(j, null)), 'gallons')} for {shortReference(j.reference)}
                </div>
              </div>
              {/* No road distance yet (no OSRM, SRS §12.1): nothing rather than a guess. */}
              {j.station.minutes !== null && j.station.distance_km !== null && (
                <div className="text-right">
                  <div className="text-[20px] font-extrabold text-[#15803D]">{j.station.minutes} min</div>
                  <div className="text-chip text-mute">{j.station.distance_km} km</div>
                </div>
              )}
            </div>
            <ExternalButton href={directionsUrl(j.station.address)} className={GREEN_BUTTON}>
              <NavigationIcon size={20} filled />
              Start navigation
            </ExternalButton>
            <ButtonLink to={`${base}/jobs/${j.reference}/loading`} variant="alt" className={GREEN_ALT}>
              I have arrived at the station
            </ButtonLink>
          </div>
        </MobileShell>
      )}
    </JobStep>
  )
}

/** Gallons added or removed per tap on the loading screen. */
const STEP_GALLONS = 50

/** At the station: count the gallons in and confirm (`t-loading`, FR-034). */
export function DriverLoading() {
  return <JobStep stage="accepted">{(j) => <LoadingForm job={j} />}</JobStep>
}

function LoadingForm({ job: j }: { job: PartnerJob }) {
  const { base } = usePartnerApp()
  const navigate = useNavigate()
  const profile = usePartnerProfile()
  const confirm = useConfirmPickup(j.reference)
  const fileRef = useRef<HTMLInputElement>(null)
  const [gallons, setGallons] = useState(j.pickup?.gallons_loaded ?? 0)
  const [checks, setChecks] = useState({ valves: false, receipt: false })
  const [photo, setPhoto] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const target = targetGallons(j, profile.data?.vehicle.tank_gallons)
  const capacity = Math.max(target, profile.data?.vehicle.tank_gallons ?? target)
  const toGo = Math.max(0, target - gallons)
  const full = toGo === 0

  function submit() {
    confirm.mutate(
      { loaded: true, receipt: checks.receipt, photo_url: photo, gallons_loaded: gallons },
      { onSuccess: () => navigate(`${base}/jobs/${j.reference}/customer`) },
    )
  }

  // Design rows: "Tank was cleaned before loading", "Valves closed and sealed".
  // No quality claims (decision 15), so the rows say only what the driver did.
  const rows: { key: keyof typeof checks; label: string }[] = [
    { key: 'valves', label: 'Valves closed for the trip' },
    { key: 'receipt', label: 'Station receipt collected' },
  ]

  return (
    <MobileShell>
      <TopBar
        left={<BackLink to={`${base}/jobs/${j.reference}/refill`} />}
        right={<Chip tone="green">At station</Chip>}
      />
      <ScrollArea className="gap-3">
        <ScreenHeading
          className="rise-1"
          title="Confirm loading"
          sub={`${shortReference(j.reference)} · ${j.station.name} · needs ${describeQuantity(litresFromGallons(target), 'gallons', 'short')}`}
        />
        <Card pad className="rise-2 flex items-center gap-4">
          <TankGauge fraction={gallons / capacity} target={target / capacity} targetLabel={target.toLocaleString('en-NG')} />
          <div className="flex-1">
            <div className="text-caption text-mute">Loaded so far</div>
            <div className="text-[32px] font-extrabold tracking-[-1px]" aria-live="polite">
              {gallons.toLocaleString('en-NG')}
              <span className="text-[15px] text-mute"> gal · {litresFromGallons(gallons).toLocaleString('en-NG')} L</span>
            </div>
            <Chip tone={full ? 'green' : 'amber'} className="mt-1">
              {full ? 'Full load' : `${describeQuantity(litresFromGallons(toGo), 'gallons', 'short')} to go`}
            </Chip>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                aria-label={`Remove ${STEP_GALLONS} gallons`}
                disabled={gallons <= 0}
                onClick={() => setGallons((g) => Math.max(0, g - STEP_GALLONS))}
                className="h-11 w-12 cursor-pointer rounded-input border-[1.5px] border-solid border-line bg-white text-[22px] font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                −
              </button>
              <button
                type="button"
                aria-label={`Add ${STEP_GALLONS} gallons`}
                disabled={gallons >= capacity}
                onClick={() => setGallons((g) => Math.min(capacity, g + STEP_GALLONS))}
                className="h-11 flex-1 cursor-pointer rounded-input border-0 bg-sky text-[15px] font-extrabold text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                + {STEP_GALLONS} gal
              </button>
            </div>
          </div>
        </Card>
        <Card className="rise-3 px-3.5 py-1">
          {rows.map((r) => {
            const on = checks[r.key]
            return (
              <button
                key={r.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setChecks((c) => ({ ...c, [r.key]: !c[r.key] }))}
                className="mo-li w-full cursor-pointer bg-transparent text-left text-[14px] font-semibold"
              >
                {on ? (
                  <IconBadge tone="green" size={30} radius={9}>
                    <CheckIcon size={15} strokeWidth={3} roundJoin={false} />
                  </IconBadge>
                ) : (
                  <span aria-hidden="true" className="box-border size-[30px] shrink-0 rounded-[9px] border-2 border-solid border-radio-line" />
                )}
                {r.label}
              </button>
            )
          })}
        </Card>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rise-4 flex h-16 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-option border-2 border-dashed border-blink bg-[#F4F9FF] font-bold text-primary"
        >
          {photo ? <img src={photo} alt="Meter photo" className="size-10 rounded-[8px] object-cover" /> : <CameraIcon size={22} />}
          {photo ? 'Meter photo added · change' : 'Add a photo of the meter (optional)'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            setProblem(file ? readPickupPhoto(file, setPhoto) : null)
          }}
        />
      </ScrollArea>
      <Footer>
        {problem && <Notice tone="error">{problem}</Notice>}
        {confirm.isError && <Notice tone="error">{errorMessage(confirm.error)}</Notice>}
        <Button onClick={submit} disabled={!full} loading={confirm.isPending}>
          {full ? 'Confirm loading' : `Load ${target.toLocaleString('en-NG')} gal to continue`}
        </Button>
        <Link to={`${base}/issue?ref=${j.reference}&type=station_problem`} className="p-1 text-center text-sub font-bold text-primary no-underline hover:text-primary-dark">
          Report a problem at the station
        </Link>
      </Footer>
    </MobileShell>
  )
}

/** Step 2: take the water to the customer (`t-customer`). */
export function DriverCustomer() {
  const { base } = usePartnerApp()
  return (
    <JobStep stage="collected">
      {(j) => {
        const eta = j.remaining ?? (j.customer.distance_km !== null && j.customer.minutes !== null ? { distance_km: j.customer.distance_km, minutes: j.customer.minutes } : null)
        const [lead, ...rest] = (j.tank_note ?? '').split('. ')
        return (
          <MobileShell>
            <TopBar left={<BackLink to={base} />} right={<Chip tone="green">Step 2 of 2</Chip>} />
            <ScrollArea className="gap-3">
              <ScreenHeading
                className="rise-1"
                title={`Deliver ${describeQuantity(litresFromGallons(targetGallons(j, null)), 'gallons')}`}
                sub={`Loaded at ${j.station.name} · head to ${j.customer.area}`}
              />
              <MapFrame height={330} className="rise-2">
                <TankerCustomerMapArt />
                <Illustration
                  name="tanker"
                  alt="Your tanker"
                  className="animate-drive absolute top-[58.2%] left-[31.6%] w-[108px] drop-shadow-[0_6px_8px_rgba(10,37,64,0.25)]"
                />
                <MapPin color="#DC2626" ringColor="rgba(220,38,38,.35)" ringSize={20} className="absolute top-[15.2%] left-[74.6%]" />
                {eta && (
                  <MapBadge className="right-3 bottom-3.5 text-[14px]">
                    {eta.minutes} min · {eta.distance_km} km
                  </MapBadge>
                )}
              </MapFrame>
              {j.tank_note && (
                <div className="rise-3 flex items-start gap-2.5 rounded-option bg-[#EDE9FE] px-3.5 py-3 text-[13px] text-[#3B1F7A]">
                  <TankStandIcon size={20} color="#6D28D9" className="shrink-0" />
                  <div>
                    <b>{rest.length ? `${lead}.` : lead}</b> {rest.join('. ')}
                  </div>
                </div>
              )}
              <Card className="rise-4 flex items-center gap-3 px-3.5 py-3">
                <Avatar name={j.customer.contact_name} tone="plain" />
                <div className="flex-1">
                  <div className="font-extrabold">{j.customer.contact_name}</div>
                  <div className="text-caption text-mute">{j.customer.address.split(', Enugu')[0]}</div>
                </div>
                <a href={`tel:${j.customer.phone}`} aria-label="Call customer" className="mo-ib bg-[#DCFCE7] text-[#15803D] hover:text-[#15803D]">
                  <PhoneIcon size={20} />
                </a>
              </Card>
            </ScrollArea>
            <Footer>
              <ExternalButton href={directionsUrl(j.customer.address)} className={GREEN_BUTTON}>
                <NavigationIcon size={20} filled />
                Start navigation
              </ExternalButton>
              <ButtonLink to={`${base}/jobs/${j.reference}/code`} variant="alt" className={GREEN_ALT}>
                Arrived · water pumped in
              </ButtonLink>
            </Footer>
          </MobileShell>
        )
      }}
    </JobStep>
  )
}
