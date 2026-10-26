import { Link, useNavigate } from 'react-router-dom'
import { Illustration } from '../../../components/brand/Illustration'
import { ChevronDownIcon, ChevronRightIcon, DocumentLinesIcon, HistoryAltIcon, MapPinIcon, StarIcon } from '../../../components/icons/icons'
import { MobileShell, ScrollArea } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { CardLink } from '../../../components/ui/Card'
import { ActionTile, IconBadge, SectionHeader, TextLink } from '../../../components/ui/Content'
import { HomeAppCard } from '../../pwa/PushParts'
import { ButtonLink } from '../../../components/ui/Button'
import { CustomerTabs, CustomerTopBar } from '../components/CustomerChrome'
import { RecentOrderCard } from '../components/OrderBits'
import { useOrderDraft } from '../order/orderDraftContext'
import { draftFromOrder } from '../order/reorder'
import { useAddresses, useOrders, usePoints, useProfile } from '../queries'

/** Customer home (`c-home`). */
export function Home() {
  const navigate = useNavigate()
  const { reset } = useOrderDraft()
  const profile = useProfile()
  const addresses = useAddresses()
  const orders = useOrders()
  const points = usePoints()

  const firstName = profile.data?.name.split(' ')[0] ?? ''
  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0]
  const latest = orders.data?.[0]

  function startOrder(type: 'keke' | 'tanker') {
    reset({ delivery_type: type })
    navigate(type === 'keke' ? '/order/keke' : '/order/tanker')
  }

  function reorder() {
    if (latest) {
      reset(draftFromOrder(latest, addresses.data ?? []))
      navigate('/order/review')
    } else {
      navigate('/order')
    }
  }

  return (
    <MobileShell>
      <CustomerTopBar />
      <ScrollArea className="gap-3.5">
        {defaultAddress ? (
          <CardLink to="/order/details" className="rise-1 flex items-center gap-3 px-3.5 py-2.5">
            <IconBadge tone="blue" size={36} radius={11}>
              <MapPinIcon size={20} />
            </IconBadge>
            <span className="flex flex-1 flex-col leading-[1.3]">
              <span className="text-chip text-mute">Delivering to · {defaultAddress.label}</span>
              <span className="text-[14.5px] font-bold">{defaultAddress.address}</span>
            </span>
            <ChevronDownIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} />
          </CardLink>
        ) : (
          addresses.isSuccess && (
            <CardLink to="/addresses/new" className="rise-1 flex items-center gap-3 px-3.5 py-2.5">
              <IconBadge tone="blue" size={36} radius={11}>
                <MapPinIcon size={20} />
              </IconBadge>
              <span className="flex flex-1 flex-col leading-[1.3]">
                <span className="text-chip text-mute">Delivering to</span>
                <span className="text-[14.5px] font-bold">Add your delivery address</span>
              </span>
              <ChevronRightIcon size={18} strokeWidth={2.2} color="#56677D" roundJoin={false} />
            </CardLink>
          )
        )}

        <div className="rise-2 relative min-h-[172px] overflow-hidden rounded-[22px] bg-[#DCEBFB]">
          <Illustration name="drop-hero" className="absolute top-0 right-[-36px] h-full w-auto max-w-none" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(234,243,254,.97)_0%,rgba(234,243,254,.88)_46%,rgba(234,243,254,0)_72%)]" />
          <div className="relative max-w-[220px] px-[18px] py-5">
            <div className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.4px]">Welcome back,</div>
            <div className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.5px] text-primary">{firstName ? `${firstName}!` : ' '}</div>
            {/* Design said "Clean water poured...": quality claim removed (decision 15). */}
            <p className="mt-2 mb-0 text-[13px] text-slate">Water poured straight into your tank. No lifting, no stress.</p>
          </div>
        </div>

        <div className="rise-3 grid grid-cols-2 gap-3">
          <VehicleCard
            onClick={() => startOrder('keke')}
            title="Order with Keke"
            sub="25 L or 50 L cans · 12 to 60 cans"
            illustration="keke"
            alt="Blue keke loaded with jerrycans"
            gradient="bg-[linear-gradient(160deg,#E4F0FE_0%,#CFE3FB_100%)]"
            accent="#1570D8"
            subColor="text-primary-dark"
          />
          <VehicleCard
            onClick={() => startOrder('tanker')}
            title="Order with Tanker"
            sub="500 to 1,000 gallons (2,000 to 4,000 litres) or custom"
            illustration="tanker"
            alt="MmiriOma water tanker truck"
            gradient="bg-[linear-gradient(160deg,#E6F8EE_0%,#CDEFDC_100%)]"
            accent="#15803D"
            subColor="text-green"
            imageClass="mt-3.5 [animation-delay:.6s]"
          />
        </div>

        <div className="rise-4 grid grid-cols-4 gap-2.5">
          <ActionTile onClick={reorder} icon={<IconBadge tone="blue"><HistoryAltIcon size={22} /></IconBadge>} label="Reorder" />
          <ActionTile to="/addresses" icon={<IconBadge tone="green"><MapPinIcon size={22} /></IconBadge>} label="Addresses" />
          <ActionTile
            to="/points"
            icon={<IconBadge tone="gold"><StarIcon size={22} filled /></IconBadge>}
            label={points.data ? `${points.data.balance} pts` : 'Points'}
          />
          <ActionTile to="/orders" icon={<IconBadge tone="violet"><DocumentLinesIcon size={22} /></IconBadge>} label="My orders" />
        </div>

        <div className="rise-5 relative box-border min-h-32 overflow-hidden rounded-card bg-[linear-gradient(120deg,#FFF7E2_0%,#FFE9B8_100%)] py-4 pr-4 pl-[18px]">
          <Illustration name="gift" className="animate-float absolute top-1.5 right-[-6px] w-[150px]" />
          <div className="relative max-w-[190px]">
            <div className="text-[17px] leading-[1.2] font-extrabold">Earn points on every delivery</div>
            <p className="mt-1.5 mb-2.5 text-caption text-[#5A4310]">Collect points and use them for money off your next order.</p>
            <Link
              to="/points"
              className="hit-44 inline-flex h-9 items-center rounded-chip bg-ink px-4 text-[13px] font-bold text-white no-underline hover:text-white"
            >
              See my points
            </Link>
          </div>
        </div>

        <HomeAppCard app="customer" className="rise-5" />

        <SectionHeader className="mt-0.5" title="Recent orders" action={<TextLink to="/orders" className="text-sub">View all</TextLink>} />
        {orders.isPending && <LoadingBlock lines={1} label="Loading your orders" />}
        {orders.isError && <ErrorBlock error={orders.error} onRetry={() => orders.refetch()} />}
        {orders.isSuccess &&
          (latest ? (
            <RecentOrderCard order={latest} />
          ) : (
            <EmptyBlock
              title="No orders yet"
              text="Your orders will show here."
              action={<ButtonLink to="/order" variant="alt">Order water</ButtonLink>}
            />
          ))}
      </ScrollArea>
      <CustomerTabs current="/home" />
    </MobileShell>
  )
}

function VehicleCard({
  onClick,
  title,
  sub,
  illustration,
  alt,
  gradient,
  accent,
  subColor,
  imageClass = 'mt-1',
}: {
  onClick: () => void
  title: string
  sub: string
  illustration: 'keke' | 'tanker'
  alt: string
  gradient: string
  accent: string
  subColor: string
  imageClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative box-border flex min-h-[214px] cursor-pointer flex-col overflow-hidden rounded-card border-0 px-3 pt-2.5 pb-3.5 text-left text-ink transition-transform duration-150 hover:-translate-y-0.5 ${gradient}`}
    >
      <Illustration name={illustration} alt={alt} className={`animate-float h-auto w-full ${imageClass}`} />
      <span className="mt-auto text-[18px] leading-[1.15] font-extrabold">{title}</span>
      <span className={`mt-1 text-chip font-semibold ${subColor}`}>{sub}</span>
      <span className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-white shadow-[0_4px_10px_rgba(10,37,64,0.12)]">
        <ChevronRightIcon size={16} strokeWidth={2.6} color={accent} roundJoin={false} />
      </span>
    </button>
  )
}
