import type { SavedAddress } from '../../../domain/orders'

/**
 * Where "Continue" on the quantity screen goes: returning customers with
 * saved addresses pick one (`c-address-pick`); everyone else enters delivery
 * details (`c-details`).
 */
export function addressStepPath(addresses: SavedAddress[] | undefined): string {
  return addresses && addresses.length > 0 ? '/order/address' : '/order/details'
}
