import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TextAreaField } from '../../../components/ui/Field'
import { NOTE_MAX, noteError } from './logic'

/**
 * The dialog for a decision that takes a note (continue, resume, withdraw;
 * admin-hold-review.md): the sentence on what happens, then the note, then
 * the confirm button. A required note is checked here, so nothing is sent
 * without one; a field the server refused (422) shows under it. The note is
 * kept when the dialog is closed and reopened, and when a request fails.
 */
export function NoteDialog({
  open,
  title,
  children,
  noteLabel,
  noteHint,
  required,
  confirmLabel,
  tone,
  loading,
  serverError,
  onSend,
  onCancel,
}: {
  open: boolean
  title: string
  /** What happens next. */
  children: ReactNode
  noteLabel: string
  noteHint?: string
  /** A required note must have 1 to 500 characters; an optional one only the upper bound. */
  required: boolean
  confirmLabel: string
  tone: 'primary' | 'danger'
  loading: boolean
  /** The server's refusal of the note, shown under it. */
  serverError?: string
  onSend: (note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const localError = required ? noteError(note) : note.length > NOTE_MAX ? noteError(note) : undefined
  const error = tried ? (localError ?? serverError) : serverError

  function confirm() {
    setTried(true)
    if (localError) return
    onSend(note.trim())
  }

  return (
    <ConfirmDialog open={open} title={title} confirmLabel={confirmLabel} cancelLabel="Back" tone={tone} loading={loading} onCancel={onCancel} onConfirm={confirm}>
      <span className="flex flex-col gap-3">
        <span>{children}</span>
        <TextAreaField
          label={noteLabel}
          optional={!required}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          error={error}
          onChange={(e) => setNote(e.target.value)}
          hint={`${noteHint ? `${noteHint} · ` : ''}${note.length} / ${NOTE_MAX}`}
        />
      </span>
    </ConfirmDialog>
  )
}
