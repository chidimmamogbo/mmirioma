/**
 * Join class names, skipping falsy values.
 *
 * @example cx('btn', isOn && 'on', className)
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
