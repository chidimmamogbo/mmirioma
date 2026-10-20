/**
 * Directions link for "Start navigation". Opens the phone's maps app (Google
 * Maps on Android) with the address as the destination. The app has no map
 * provider of its own (none is approved); this only hands the address over
 * when the partner taps the button.
 */
export function directionsUrl(address: string): string {
  const destination = /enugu/i.test(address) ? address : `${address}, Enugu`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
