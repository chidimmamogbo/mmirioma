/** Largest pickup photo we keep (the mock stores it in the tab as a data URL). */
export const MAX_PHOTO_BYTES = 500_000

/**
 * Checks a chosen pickup photo and reads it as a data URL.
 *
 * @param file - The file from the camera or gallery input.
 * @param onPhoto - Called with the data URL once the file is read.
 * @returns A message for the partner when the file cannot be used, else null.
 */
export function readPickupPhoto(file: File, onPhoto: (dataUrl: string) => void): string | null {
  if (!file.type.startsWith('image/')) return 'Choose a photo.'
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is too large. Choose one under 500 KB.'
  const reader = new FileReader()
  reader.onload = () => onPhoto(String(reader.result))
  reader.readAsDataURL(file)
  return null
}
