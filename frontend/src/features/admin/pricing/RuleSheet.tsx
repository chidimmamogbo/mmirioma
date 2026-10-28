import { useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui/Button'
import { RadioRow } from '../../../components/ui/Choice'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import type { PriceRule, WaterCategoryOption } from '../../../domain/admin'
import { cx } from '../../../lib/cx'
import { SelectField } from '../AdminParts'
import { SideSheet } from '../confirm/SideSheet'
import { formToRule, ruleErrors, ruleToForm, type RuleField, type RuleForm } from './logic'

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx('m-0 flex flex-col gap-3 rounded-card border border-card-line bg-white px-4 py-3.5 text-sub', className)}>
      <legend className="px-1 text-[15px] font-extrabold">{title}</legend>
      {children}
    </fieldset>
  )
}

/**
 * P1, the rule sheet (admin-pricing.md): add or edit one rule. The rule joins
 * the next version; nothing is saved until "Save as version N+1" on the page,
 * so the button says "Add rule" / "Update rule", never "Save" (decision 3).
 */
export function RuleSheet({
  number,
  rule,
  areas,
  waters,
  onDone,
  onClose,
}: {
  /** The rule's number in the list (1-based), or `null` to add one. */
  number: number | null
  rule: PriceRule | null
  areas: { id: string; name: string; is_active: boolean }[]
  waters: WaterCategoryOption[]
  onDone: (rule: PriceRule) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<RuleForm>(() => ruleToForm(rule))
  const [shown, setShown] = useState<Partial<Record<RuleField, string>>>({})
  const set = (patch: Partial<RuleForm>) => setForm((f) => ({ ...f, ...patch }))
  // A new rule offers the active categories; a rule that already names an inactive one still shows it (#163).
  const waterChoices = waters.filter((w) => w.is_active || w.id === rule?.water_category_id)
  const areaChoices = areas.filter((a) => a.is_active || a.id === rule?.zone_id)
  const errorCount = Object.keys(shown).length

  function done() {
    const errors = ruleErrors(form)
    setShown(errors)
    if (Object.keys(errors).length === 0) onDone(formToRule(form))
  }

  return (
    <SideSheet
      title={number === null ? 'Add a rule' : `Edit rule ${number}`}
      sub={`Changes go into the next version when you press "Save as version".`}
      onClose={onClose}
      footer={
        <>
          <Button variant="line" block={false} className="px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button block={false} className="px-6" onClick={done}>
            {number === null ? 'Add rule' : 'Update rule'}
          </Button>
        </>
      }
    >
      {errorCount > 0 && (
        <Notice tone="error">
          <b>Check {errorCount === 1 ? '1 field' : `${errorCount} fields`}.</b>
        </Notice>
      )}

      <Section title="1 Applies to">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <SelectField label="Area" value={form.zoneId ?? ''} onChange={(e) => set({ zoneId: e.target.value || null })}>
              <option value="">Every area</option>
              {areaChoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.is_active ? '' : ' (not active)'}
                </option>
              ))}
            </SelectField>
            <p className="mt-1.5 mb-0 text-caption text-mute">"Every area" covers areas without a rule of their own.</p>
          </div>
          <SelectField label="Water" value={form.waterId ?? ''} onChange={(e) => set({ waterId: e.target.value || null })}>
            <option value="">Every water</option>
            {waterChoices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
                {w.is_active ? '' : ' (not active)'}
              </option>
            ))}
          </SelectField>
        </div>
      </Section>

      <Section title="2 Quantity">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="From (litres)"
            inputMode="numeric"
            value={form.from}
            hint="The smallest order is 600 litres."
            error={shown.from}
            onChange={(e) => set({ from: e.target.value.replace(/[^\d,]/g, '') })}
          />
          <div className="flex flex-col gap-1">
            <TextField
              label="To (litres)"
              inputMode="numeric"
              value={form.noUpperLimit ? '' : form.to}
              disabled={form.noUpperLimit}
              error={shown.to}
              onChange={(e) => set({ to: e.target.value.replace(/[^\d,]/g, '') })}
            />
            <label className="flex min-h-11 items-center gap-2 font-bold">
              <input type="checkbox" className="size-5" checked={form.noUpperLimit} onChange={(e) => set({ noUpperLimit: e.target.checked })} />
              No upper limit
            </label>
          </div>
        </div>
      </Section>

      <Section title="3 Handling and margin">
        <TextField
          label="Handling per order (₦)"
          inputMode="numeric"
          value={form.handling}
          error={shown.handling}
          onChange={(e) => set({ handling: e.target.value.replace(/[^\d,]/g, '') })}
        />
        <div role="radiogroup" aria-label="Margin" className="flex flex-col gap-2">
          <span className="font-bold">Margin</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <RadioRow checked={form.marginType === 'percentage'} onSelect={() => set({ marginType: 'percentage', marginValue: '' })}>
              Percentage
            </RadioRow>
            <RadioRow checked={form.marginType === 'fixed'} onSelect={() => set({ marginType: 'fixed', marginValue: '' })}>
              Fixed amount (₦)
            </RadioRow>
          </div>
          <TextField
            label={form.marginType === 'percentage' ? 'Percentage (%)' : 'Fixed amount (₦)'}
            inputMode={form.marginType === 'percentage' ? 'decimal' : 'numeric'}
            value={form.marginValue}
            hint={form.marginType === 'percentage' ? 'Of water, delivery and handling together.' : undefined}
            error={shown.margin}
            onChange={(e) => set({ marginValue: e.target.value.replace(form.marginType === 'percentage' ? /[^\d.]/g : /[^\d,]/g, '') })}
          />
        </div>
      </Section>

      <details className="rounded-card border border-card-line bg-white px-4 py-3.5 text-sub">
        <summary className="min-h-6 cursor-pointer text-[15px] font-extrabold">4 Delivery rates for road distance (not used yet)</summary>
        <p className="mt-2 mb-3 text-mute">
          Saved for when the app can measure road distance. Until then, delivery is the area&apos;s fee on Service areas, and these don&apos;t change any price.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Base fee (₦)" inputMode="numeric" value={form.base} error={shown.base} onChange={(e) => set({ base: e.target.value.replace(/[^\d,]/g, '') })} />
          <TextField label="Per km (₦)" inputMode="numeric" value={form.perKm} error={shown.perKm} onChange={(e) => set({ perKm: e.target.value.replace(/[^\d,]/g, '') })} />
          <TextField
            label="Second trip (₦)"
            inputMode="numeric"
            value={form.secondTrip}
            error={shown.secondTrip}
            onChange={(e) => set({ secondTrip: e.target.value.replace(/[^\d,]/g, '') })}
          />
        </div>
      </details>
    </SideSheet>
  )
}
