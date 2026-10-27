/**
 * Customer support and account-deletion adapters (#88, part 4): the real-API
 * side of `listTickets`, `createTicket` and `requestAccountDeletion` in
 * `customerApi.ts`, against the endpoints of #82 part 4 (PR #100).
 *
 * Conversions follow docs/api/customer-account.md ("Mapping to the design
 * types"): a support request becomes a `problem` ticket, the deletion
 * request a `question` ticket, as the mock shows them.
 */
import { PROBLEM_LABEL, shortReference, type ProblemType, type SupportTicket } from '../../../domain/orders'
import { ApiError, apiClient, type ApiClient } from '../../../lib/api/client'
import {
  createDeletionRequest,
  createSupportRequest,
  getDeletionRequest,
  listSupportRequests,
  type DeletionRequestRead,
  type SupportRequestRead,
} from '../../../lib/api/customerSupport'

/** Page size when loading every request: the contract's maximum. */
const PAGE_LIMIT = 100

/** The ticket title for a deletion request, as the mock words it. */
export const DELETION_TITLE = 'Delete my account'

/** Backend support request to the design's ticket. */
export function ticketFromSupportRequest(read: SupportRequestRead): SupportTicket {
  return {
    // The server sends no internal id; the public reference is unique.
    id: read.reference,
    number: read.reference,
    title: PROBLEM_LABEL[read.type] ?? PROBLEM_LABEL.other,
    at: read.created_at,
    note: read.order_reference ? `About ${shortReference(read.order_reference)}` : null,
    status: read.status,
    kind: 'problem',
  }
}

/**
 * Backend deletion request to the design's ticket. It stays open until staff
 * complete or refuse it (privacy notice §9).
 */
export function ticketFromDeletionRequest(read: DeletionRequestRead): SupportTicket {
  return {
    id: read.reference,
    number: read.reference,
    title: DELETION_TITLE,
    at: read.requested_at,
    // The reason is not sent back (it is never shown to staff lists either).
    note: null,
    status: read.status === 'completed' || read.status === 'refused' ? 'resolved' : 'open',
    kind: 'question',
  }
}

/**
 * Every ticket, newest first: the support requests plus the open deletion
 * request, if any (a 404 `deletion_request_not_found` means none).
 *
 * @throws {ApiError} The backend's errors unchanged.
 */
export async function listTickets(client: ApiClient = apiClient): Promise<SupportTicket[]> {
  const requests: SupportRequestRead[] = []
  for (;;) {
    const page = await listSupportRequests({ limit: PAGE_LIMIT, offset: requests.length }, undefined, client)
    requests.push(...page.items)
    if (page.items.length === 0 || requests.length >= page.total) break
  }
  let deletion: SupportTicket | null = null
  try {
    deletion = ticketFromDeletionRequest(await getDeletionRequest(undefined, client))
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'deletion_request_not_found')) throw error
  }
  const tickets = requests.map(ticketFromSupportRequest)
  if (deletion) tickets.push(deletion)
  return tickets.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/**
 * Keys of reports sent but not yet confirmed, by content. The screen gives no
 * key, so a retry of the same report after a dropped connection reuses its
 * key and the server returns the one already stored (FR-026 pattern). A key is
 * dropped once the server answers, so a later identical report is a new one.
 */
const pendingKeys = new Map<string, string>()

/**
 * Send a support request.
 *
 * @throws {ApiError} 404 `order_not_found`; 409 `idempotency_key_reused`; 422 `validation_error`.
 */
export async function createTicket(
  input: { type: ProblemType; message: string; reference: string | null },
  client: ApiClient = apiClient,
): Promise<SupportTicket> {
  const content = JSON.stringify([input.type, input.message.trim(), input.reference])
  const key = pendingKeys.get(content) ?? crypto.randomUUID()
  pendingKeys.set(content, key)
  try {
    const created = await createSupportRequest(
      { type: input.type, message: input.message, order_reference: input.reference, idempotency_key: key },
      client,
    )
    pendingKeys.delete(content)
    return ticketFromSupportRequest(created)
  } catch (error) {
    // Only a lost answer keeps the key for a retry; an answered refusal stores nothing.
    if (!(error instanceof ApiError && error.kind === 'network')) pendingKeys.delete(content)
    throw error
  }
}

/**
 * Ask for the account to be deleted. Nothing is deleted until staff verify
 * the request; a second request returns the open one.
 *
 * @throws {ApiError} 422 `validation_error`.
 */
export async function requestAccountDeletion(reason: string, client: ApiClient = apiClient): Promise<SupportTicket> {
  return ticketFromDeletionRequest(await createDeletionRequest(reason.trim() || null, client))
}
