/** Number of contact attempts the server asks for before a job may fail (FR-038). */
export const REQUIRED_ATTEMPTS = 2

/** "0 of 2 attempts recorded", "2 of 2 attempts recorded" or, past two, "3 attempts recorded". */
export function attemptCountLine(count: number): string {
  return count > REQUIRED_ATTEMPTS ? `${count} attempts recorded` : `${count} of ${REQUIRED_ATTEMPTS} attempts recorded`
}
