import type { ReactNode } from 'react'
import { Card } from '../../../components/ui/Card'
import { Chip } from '../../../components/ui/Chip'
import { KeyValue } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import type { HoldReview, PickupEvidence, ProofEvidence } from '../../../lib/api/adminHolds'
import { formatTime } from '../../../lib/format/datetime'
import { ELIGIBILITY_CHIP, INCIDENT_LABEL, PROOF_REASON_LABEL, REPORT_KIND_LABEL, deliveryCodeLine, STAFF_STATUS_LABEL } from './logic'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-label font-extrabold tracking-[0.3px] text-mute uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** The driver's own words, quoted. */
function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="m-0 border-0 border-l-[3px] border-solid border-line py-0.5 pl-3 text-slate italic">{children}</blockquote>
}

function DriverNote({ note }: { note: string | null }) {
  if (!note) return null
  return (
    <div>
      <div className="mb-1 font-bold">Driver&apos;s note</div>
      <Quote>{note}</Quote>
    </div>
  )
}

/** R1: the alternative proof the driver sent. The delivery code itself is never shown, and a shared location is text only (design decision 4). */
export function ProofEvidenceView({ proof }: { proof: ProofEvidence }) {
  const attempts = proof.contact_attempts
  return (
    <Section title="Alternative proof">
      <Card className="flex flex-col p-3 text-[13.5px]">
        <KeyValue label="Delivered" value={`${proof.delivered_litres.toLocaleString('en-NG')} L`} />
        <KeyValue label="Why there is no code" value={proof.reason ? PROOF_REASON_LABEL[proof.reason] : 'Not recorded'} />
        <KeyValue label="Arrived" value={proof.arrived_at ? formatTime(proof.arrived_at) : 'Not recorded'} />
        <KeyValue label="Unloading completed" value={proof.unloading_completed_at ? formatTime(proof.unloading_completed_at) : 'Not recorded'} />
        <KeyValue label="Proof sent" value={formatTime(proof.sent_at)} />
        <KeyValue label="Delivery code" value={<span className="font-semibold">{deliveryCodeLine(proof.delivery_code)}</span>} />
        <KeyValue label="Contact attempts" value={attempts.length === 0 ? 'No contact attempts recorded' : attempts.map((a) => formatTime(a.attempted_at)).join(', ')} />
        <KeyValue
          label="Location"
          value={
            proof.location
              ? `${proof.location.latitude}, ${proof.location.longitude}${proof.location.accuracy_metres === null ? '' : ` (±${proof.location.accuracy_metres} m)`}`
              : 'No location shared'
          }
        />
      </Card>
      {proof.delivery_code && <p className="m-0 text-caption text-mute">The code itself is never shown.</p>}
      <DriverNote note={proof.driver_note} />
    </Section>
  )
}

/** R2: what the driver collected, from which source, and any safety concern they flagged. */
export function PickupEvidenceView({ pickup }: { pickup: PickupEvidence }) {
  const used = pickup.used_source.assigned ? 'The assigned source' : `Another source: ${pickup.used_source.name}`
  return (
    <Section title="Pickup">
      <Card className="flex flex-col p-3 text-[13.5px]">
        <KeyValue label="Assigned source" value={pickup.assigned_source ? `${pickup.assigned_source.name} · ${pickup.assigned_source.approximate_location}` : 'No source assigned'} />
        <KeyValue label="Used" value={used} />
        <KeyValue label="Source reference" value={pickup.source_reference ?? 'Not recorded'} />
        <KeyValue label="Collected" value={`${pickup.volume_collected_litres.toLocaleString('en-NG')} L`} />
        <KeyValue label="Picked up" value={formatTime(pickup.picked_up_at)} />
      </Card>
      {pickup.safety_concern ? (
        <Notice tone="note">
          <b>The driver flagged a safety concern at pickup.</b>
          {pickup.safety_note && (
            <div className="mt-1.5">
              <Quote>{pickup.safety_note}</Quote>
            </div>
          )}
        </Notice>
      ) : (
        <p className="m-0 text-mute">No safety concern flagged.</p>
      )}
    </Section>
  )
}

/** R2: "Can this source be used?", with the server's sentence word for word and never our own. */
export function EligibilityCard({ answer, message }: { answer: keyof typeof ELIGIBILITY_CHIP; message: string }) {
  const chip = ELIGIBILITY_CHIP[answer]
  return (
    <Section title="Can this source be used?">
      <Card className="flex flex-col gap-2 p-3">
        <div>
          <Chip tone={chip.tone}>{chip.label}</Chip>
        </div>
        <p className="m-0">{message}</p>
      </Card>
    </Section>
  )
}

/** R3: the unsafe report the driver made, and when the order was where. */
export function ReportEvidenceView({ report }: { report: NonNullable<HoldReview['report']> }) {
  const then = report.order_status_then ? STAFF_STATUS_LABEL[report.order_status_then] : null
  return (
    <Section title="Unsafe stop">
      <Card className="flex flex-col p-3 text-[13.5px]">
        <KeyValue label="Reported" value={REPORT_KIND_LABEL[report.kind] ?? 'Unsafe report'} />
        <KeyValue label="When" value={`${formatTime(report.reported_at)}${then ? `, while the order was ${then}` : ''}`} />
      </Card>
      <DriverNote note={report.note} />
    </Section>
  )
}

/** "Other reports from the driver": the job's other incidents, oldest first. */
export function OtherReports({ incidents }: { incidents: HoldReview['incidents'] }) {
  return (
    <Section title="Other reports from the driver">
      {incidents.length === 0 ? (
        <p className="m-0 text-mute">No other reports.</p>
      ) : (
        <Card className="flex flex-col p-3 text-[13.5px]">
          {incidents.map((i) => (
            <KeyValue key={`${i.kind}-${i.reported_at}`} label={`${INCIDENT_LABEL[i.kind] ?? 'Report'} · ${formatTime(i.reported_at)}`} value={i.note ? `"${i.note}"` : 'No note'} />
          ))}
        </Card>
      )}
    </Section>
  )
}
