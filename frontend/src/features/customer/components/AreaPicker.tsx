import { useId, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { Chip } from '../../../components/ui/Chip'
import { RadioRow } from '../../../components/ui/Choice'
import { Notice } from '../../../components/ui/Notice'
import { AlertCircleIcon } from '../../../components/icons/icons'
import type { SavedAddress } from '../../../domain/orders'
import type { AreaChoice } from '../order/livePrice'
import { useServiceZones } from '../queries'

/**
 * The area picker (`c-details`, customer-live-prices.md screen 2): the areas
 * the server lists (FR-020), then "My area is not listed". Loading, failed to
 * load (Try again, details kept) and empty (only "not listed") as designed.
 * `notListedNote` is the screen's message for "not listed".
 */
export function AreaPicker({
  value,
  onChange,
  notListedNote,
  error,
  className,
}: {
  value: AreaChoice
  onChange: (choice: AreaChoice) => void
  notListedNote: ReactNode
  error?: string
  className?: string
}) {
  const zones = useServiceZones()
  const errorId = useId()
  return (
    <fieldset className={className ?? 'm-0 border-0 p-0'} aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 p-0 text-label font-bold">
        Area <span className="font-semibold text-mute">· needed for your price</span>
      </legend>
      {zones.isPending && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Loading the areas we serve</span>
          <div aria-hidden="true" className="skeleton h-12.5 rounded-option bg-segment" />
          <div aria-hidden="true" className="skeleton h-12.5 rounded-option bg-segment" />
          <span aria-hidden="true" className="text-caption text-mute">
            Loading the areas we serve…
          </span>
        </div>
      )}
      {zones.isError && (
        <Notice tone="error">
          <b>Couldn't load the areas.</b> Check your connection. Your details are kept.
          <span className="mt-2 block">
            <Button variant="alt" size="sm" block={false} onClick={() => zones.refetch()}>
              Try again
            </Button>
          </span>
        </Notice>
      )}
      {zones.isSuccess && (
        <div role="radiogroup" aria-label="Area" className="flex flex-col gap-2">
          {zones.data.map((z) => (
            <RadioRow key={z.id} checked={value !== 'not_listed' && value?.id === z.id} onSelect={() => onChange({ id: z.id, name: z.name })}>
              <span className="flex-1 text-input font-bold">{z.name}</span>
            </RadioRow>
          ))}
          {zones.data.length === 0 && <p className="m-0 text-label text-mute">We are not serving any area through the app right now.</p>}
          <RadioRow checked={value === 'not_listed'} onSelect={() => onChange('not_listed')}>
            <span className="flex-1 text-input font-bold">My area is not listed</span>
          </RadioRow>
          {value === 'not_listed' && <Notice>{notListedNote}</Notice>}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 mb-0 text-caption font-bold text-red">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/**
 * "Area: GRA", plus "No longer served" (icon and words, never colour alone)
 * when the area has stopped being served (customer-live-prices.md, decision
 * 2). Nothing when the address has no area.
 */
export function AddressArea({ zone }: { zone: SavedAddress['zone'] }) {
  if (!zone) return null
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-caption font-bold text-mute">Area: {zone.name}</span>
      {!zone.is_active && (
        <Chip tone="amber" className="px-2 py-0.5 text-chip" icon={<AlertCircleIcon size={12} strokeWidth={2.6} />}>
          No longer served
        </Chip>
      )}
    </span>
  )
}
