import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TextAreaField } from '../../../components/ui/Field'
import type { AdminOrder } from '../../../domain/admin'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { USE_MOCKS } from '../../../lib/api/mode'
import * as api from '../adminApi'
import { adminKeys } from '../queries'
import { CANCEL_REASON, CANCELLED_TOAST, cancelProblem, cancelSentences } from './cancel'
import { NOTE_MAX } from './logic'

/**
 * The CANCEL dialog (admin-hold-review.md; from the order panel,
 * admin-order-cancellation.md C1): the fixed reason, the server's sentence on
 * what it costs the customer, what the cancel does, and an optional note.
 * "Cancel order" stays off until the sentence has loaded (decision 9). The
 * note is kept when a request fails.
 */
export function CancelDialog({
  order,
  holdId = null,
  onClose,
  onCancelled,
}: {
  order: Pick<AdminOrder, 'reference' | 'backend_status' | 'partner' | 'hold'>
  /** From a hold review (R2, R3); none from the order panel. */
  holdId?: string | null
  onClose: () => void
  /** Runs once the cancel succeeded, before the order refreshes, with the toast text. */
  onCancelled: (toast: string) => void
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const outcome = useQuery({
    queryKey: [...adminKeys.all, 'cancel-outcome', order.reference],
    queryFn: () => api.getCancellationOutcome(order.reference),
    retry: false,
    staleTime: 0,
  })
  const cancel = useMutation({
    mutationFn: async (text: string) => {
      await api.cancelOrder(order.reference, { expected_status: order.backend_status ?? '', note: text || null, hold_id: holdId })
      // Before the refresh: it removes this dialog with the order's cancel button.
      onCancelled(CANCELLED_TOAST)
    },
    retry: false,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.all })
    },
  })

  const outcomeProblem = outcome.isError ? cancelProblem(outcome.error, 'outcome') : null
  const cancelError = cancel.isError ? cancelProblem(cancel.error, 'cancel') : null
  const noteError =
    note.length > NOTE_MAX
      ? `Use ${NOTE_MAX} characters or fewer.`
      : cancel.error instanceof ApiError && cancel.error.code === 'validation_error'
        ? errorMessage(cancel.error)
        : undefined
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: adminKeys.all })
    onClose()
  }

  return (
    <ConfirmDialog
      open
      title="Cancel this order?"
      confirmLabel="Cancel order"
      cancelLabel="Back"
      tone="danger"
      loading={cancel.isPending}
      confirmDisabled={!outcome.isSuccess || note.length > NOTE_MAX}
      onCancel={onClose}
      onConfirm={() => cancel.mutate(note.trim())}
    >
      <span className="flex flex-col gap-3">
        <span>
          <b>Reason:</b> {CANCEL_REASON}
        </span>
        {outcome.isPending && <span aria-live="polite">Checking what this costs the customer…</span>}
        {outcome.isSuccess && (
          <span>
            {outcome.data.message}
            {USE_MOCKS && ' (SAMPLE)'}
          </span>
        )}
        {outcomeProblem && (
          <span role="alert" className="flex flex-col items-start gap-2 text-red">
            {outcomeProblem.text}
            <Button variant="line" size="sm" block={false} onClick={() => (outcomeProblem.refresh ? refresh() : void outcome.refetch())}>
              {outcomeProblem.refresh ? 'Refresh' : 'Try again'}
            </Button>
          </span>
        )}
        {cancelSentences(order).map((s) => (
          <span key={s}>{s}</span>
        ))}
        <TextAreaField
          label="Note"
          optional
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          error={noteError}
          onChange={(e) => setNote(e.target.value)}
          hint={`${note.length} / ${NOTE_MAX}`}
        />
        {cancel.isError && !noteError && (
          <span role="alert" className="flex flex-col items-start gap-2 text-red">
            {cancelError ? cancelError.text : `${errorMessage(cancel.error)} Your note is kept.`}
            {cancelError?.refresh && (
              <Button variant="line" size="sm" block={false} onClick={refresh}>
                Refresh
              </Button>
            )}
          </span>
        )}
      </span>
    </ConfirmDialog>
  )
}
