import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Wave } from '../../../../components/art/Art'
import { Illustration } from '../../../../components/brand/Illustration'
import { BanknoteIcon, MapPinIcon } from '../../../../components/icons/icons'
import { BackLink, Footer, MobileShell, ScrollArea, TopBar } from '../../../../components/layout/MobileShell'
import { ErrorBlock, LoadingBlock } from '../../../../components/layout/StateScreens'
import { Button } from '../../../../components/ui/Button'
import { Card } from '../../../../components/ui/Card'
import { Chip, SampleTag } from '../../../../components/ui/Chip'
import { IconBadge, KeyValue, SectionHeader, TextLink } from '../../../../components/ui/Content'
import { Notice } from '../../../../components/ui/Notice'
import { WATER_SOURCE_LABEL, describeTankLitres, kekeTotalLitres } from '../../../../domain/orders'
import { errorMessage } from '../../../../lib/api/errorMessage'
import { formatNaira } from '../../../../lib/format/money'
import { formatPhone, normalizeNigerianPhone } from '../../../../lib/format/phone'
import { OrderStepHeading } from '../../components/OrderParts'
import { draftChoice } from '../../order/draft'
import { useOrderDraft } from '../../order/orderDraftContext'
import { useAddresses, useCreateOrder, useCreateTicket, useProfile, useQuote } from '../../queries'

/** Review and place the order (`c-review`). */
export function Review() {
  const navigate = useNavigate()
  const { draft, reset } = useOrderDraft()
  const profile = useProfile()
  const addresses = useAddresses()
  const createOrder = useCreateOrder()
  const requestQuote = useCreateTicket()
  const choice = draftChoice(draft)
  // Set when the order (or quote request) succeeds, before the draft is cleared,
  // so the "no address" redirect below cannot fire while we leave this page.
  const [finished, setFinished] = useState(false)

  const saved = draft.address_id ? addresses.data?.find((a) => a.id === draft.address_id) : undefined
  const address = saved
    ? { label: saved.label, address: saved.address, landmark: saved.landmark }
    : draft.new_address.address
      ? { label: draft.new_address.label || 'Delivery address', address: draft.new_address.address, landmark: draft.new_address.landmark || null }
      : null
  const quote = useQuote(choice, address?.address ?? null)
  const receiverName = draft.receiver_name || profile.data?.name || ''
  const receiverPhone = draft.receiver_phone || (profile.data ? formatPhone(profile.data.phone) : '')

  if (!finished && addresses.isSuccess && !address) return <Navigate to={addresses.data.length ? '/order/address' : '/order/details'} replace />

  const q = quote.data?.status === 'quote_available' ? quote.data : undefined
  const needsQuote = quote.data?.status === 'manual_quote_required'
  const editPath = draft.delivery_type === 'keke' ? '/order/keke' : '/order/tanker'

  function place() {
    if (!address) return
    createOrder.mutate(
      {
        idempotency_key: draft.idempotency_key,
        choice,
        address_label: address.label,
        address: address.address,
        landmark: address.landmark,
        receiver_name: receiverName,
        receiver_phone: normalizeNigerianPhone(receiverPhone) ?? receiverPhone,
        instructions: draft.instructions || null,
      },
      {
        onSuccess: (order) => {
          setFinished(true)
          reset()
          navigate(`/orders/${order.reference}/placed`, { replace: true })
        },
      },
    )
  }

  function sendQuoteRequest() {
    if (!address || choice.delivery_type !== 'tanker') return
    requestQuote.mutate(
      {
        type: 'other',
        reference: null,
        message: `Custom tanker quote: ${draft.tanker.custom_gallons || 'size not given'} gallons, ${choice.tank_type} tank, ${WATER_SOURCE_LABEL[choice.source]}, to ${address.address}. Receiver ${receiverName}, ${receiverPhone}.`,
      },
      {
        onSuccess: () => {
          setFinished(true)
          reset()
          navigate('/support?sent=quote', { replace: true })
        },
      },
    )
  }

  return (
    <MobileShell>
      <TopBar left={<BackLink to={saved ? '/order/address' : '/order/save-address'} />} />
      <ScrollArea className="gap-3">
        <OrderStepHeading step={4} title="Review your order" sub="Check everything before you place it." />
        <Card pad className="rise-2">
          <SectionHeader
            title={choice.delivery_type === 'keke' ? 'Keke delivery' : 'Tanker delivery'}
            action={<TextLink to={editPath} className="text-[13px]">Edit</TextLink>}
          />
          <div className="mt-1.5 flex items-center gap-3">
            <Illustration name={choice.delivery_type} className="animate-drive h-auto w-28 shrink-0" />
            <div className="flex-1">
              {choice.delivery_type === 'keke' ? (
                <>
                  <KeyValue label="Water size" value={`${choice.can_size_litres} litres`} />
                  <KeyValue label="Quantity" value={`${choice.can_count} cans`} />
                  <KeyValue label="Total water" value={`${kekeTotalLitres(choice).toLocaleString('en-NG')} L`} />
                </>
              ) : (
                <>
                  <KeyValue label="Tank" value={choice.tank_type === 'ground' ? 'Ground tank' : 'Overhead tank'} />
                  <KeyValue
                    label="Capacity"
                    value={choice.tank_size_gallons === null ? `${draft.tanker.custom_gallons || 'Custom'} gallons` : `${choice.tank_size_gallons.toLocaleString('en-NG')} gallons`}
                  />
                  {choice.tank_size_gallons !== null && <KeyValue label="In litres" value={describeTankLitres(choice.tank_size_gallons)} />}
                </>
              )}
              {choice.delivery_type === 'tanker' && <KeyValue label="Source" value={WATER_SOURCE_LABEL[choice.source]} />}
            </div>
          </div>
        </Card>

        <Card pad className="rise-3">
          <SectionHeader title="Delivery address" action={<TextLink to="/order/details" className="text-[13px]">Edit</TextLink>} />
          {address ? (
            <div className="mt-2 flex gap-2.5">
              <MapPinIcon size={20} color="#1570D8" className="mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">{address.address}</div>
                {address.landmark && <div className="text-caption text-mute">Landmark: {address.landmark}</div>}
                <div className="text-caption text-mute">
                  {receiverName} · {receiverPhone}
                </div>
              </div>
            </div>
          ) : (
            <LoadingBlock lines={1} />
          )}
        </Card>

        <Card pad className="rise-4">
          <h2 className="m-0 mb-2 text-section font-extrabold">Payment</h2>
          <div className="flex items-center gap-3">
            <IconBadge tone="green">
              <BanknoteIcon size={20} />
            </IconBadge>
            <div className="flex-1">
              <div className="font-bold">Pay on delivery</div>
              <div className="text-caption text-mute">Cash or bank transfer. Marked paid after our team confirms it.</div>
            </div>
          </div>
        </Card>

        {quote.isError && <ErrorBlock error={quote.error} onRetry={() => quote.refetch()} />}
        {needsQuote && (
          <Notice tone="info" className="rise-5">
            <b>Quote needed.</b> Custom tank sizes are priced by our team. Send your request and we will call you with a price before
            anything is booked.
          </Notice>
        )}
        {q && (
          <div className="rise-5 relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#0B4FA8_0%,#1570D8_60%,#16A0B8_100%)] p-4 text-white">
            <KeyValue label={<span className="text-[#D6E7FB]">{q.water.label}</span>} value={formatNaira(q.water.amount_minor_units)} />
            {q.delivery && <KeyValue label={<span className="text-[#D6E7FB]">{q.delivery.label}</span>} value={formatNaira(q.delivery.amount_minor_units)} />}
            <div className="my-2.5 h-px bg-white/25" />
            <div className="flex items-center justify-between">
              <span className="font-extrabold">Total</span>
              <span className="text-[26px] font-extrabold">{formatNaira(q.total_minor_units)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              {q.is_sample ? <SampleTag>SAMPLE PRICES</SampleTag> : <span />}
              <span className="text-chip text-[#D6E7FB]">You earn about {q.points_estimate} points</span>
            </div>
            <Wave fill="#FFFFFF" variant="low" height={34} className="bottom-[-12px] opacity-20" />
          </div>
        )}
        {quote.isPending && <LoadingBlock lines={1} label="Getting your price" />}
        {(createOrder.isError || requestQuote.isError) && (
          <Notice tone="error">
            {errorMessage(createOrder.error ?? requestQuote.error)} Your details are kept; you can try again.
          </Notice>
        )}
        {profile.data && !profile.data.phone_verified && (
          <Chip tone="amber" className="self-start whitespace-normal">
            Our team will call {formatPhone(profile.data.phone)} to confirm your number before a rider is sent.
          </Chip>
        )}
      </ScrollArea>
      <Footer>
        {needsQuote ? (
          <Button onClick={sendQuoteRequest} loading={requestQuote.isPending} disabled={!address}>
            Request a quote
          </Button>
        ) : (
          <Button onClick={place} loading={createOrder.isPending} disabled={!q || !address}>
            {q ? `Place order · ${formatNaira(q.total_minor_units)}` : 'Place order'}
          </Button>
        )}
      </Footer>
    </MobileShell>
  )
}
