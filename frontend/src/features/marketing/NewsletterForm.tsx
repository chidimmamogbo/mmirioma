import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { errorMessage } from '../../lib/api/errorMessage'
import { cx } from '../../lib/cx'
import { applyServerFieldErrors, emailField } from '../../lib/forms'
import { CheckCircleIcon } from './icons'
import { useNewsletterSignup } from './queries'

const schema = z.object({ email: emailField })
type Values = z.infer<typeof schema>

/**
 * The newsletter's email form. Loaded as its own chunk by NewsletterSignup
 * (SiteExtras.tsx), so React Hook Form and Zod stay out of the public pages'
 * main bundle. The server answers the same for new and existing addresses
 * (docs/api/public-site.md), so the success message never says whether
 * someone was already on the list.
 */
export function NewsletterForm() {
  const signup = useNewsletterSignup()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit((values) => signup.mutate(values, { onError: (e) => applyServerFieldErrors(e, setError, { email: 'email' }) }))
  const serverError = signup.isError && !errors.email ? errorMessage(signup.error) : null

  if (signup.isSuccess) {
    return (
      <p role="status" className="m-0 flex items-start gap-3 rounded-2xl bg-white p-5 text-[16px] leading-[1.5] font-semibold text-ink">
        <CheckCircleIcon size={24} className="shrink-0 text-[#0F7A3D]" />
        You're subscribed. Look out for our next email.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="newsletter-email" className="text-[15px] font-bold text-ink">
        Your email address
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          id="newsletter-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'newsletter-error' : 'newsletter-note'}
          className={cx(
            'box-border min-h-[54px] min-w-0 flex-[1_1_220px] rounded-[12px] border-[1.5px] border-solid bg-white px-4 text-[16px] text-ink',
            errors.email ? 'border-[#DC2626]' : 'border-input-line',
          )}
          {...register('email')}
        />
        <button
          type="submit"
          disabled={signup.isPending}
          aria-busy={signup.isPending || undefined}
          className="inline-flex min-h-[54px] flex-[0_0_auto] cursor-pointer items-center justify-center gap-2 rounded-[12px] border-0 bg-primary px-6 text-center text-[16px] font-bold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-wait disabled:opacity-80 max-[480.98px]:flex-[1_1_100%]"
        >
          {signup.isPending && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          Get the updates
        </button>
      </div>
      {errors.email && (
        <p id="newsletter-error" role="alert" className="m-0 text-[14px] font-bold text-[#B91C1C]">
          {errors.email.message}
        </p>
      )}
      {serverError && (
        <p role="alert" className="m-0 text-[14px] font-bold text-[#B91C1C]">
          {serverError}
        </p>
      )}
      <p id="newsletter-note" className="m-0 text-[13px] text-slate">
        We only use your email for this newsletter. See our{' '}
        <Link to="/privacy" className="font-semibold text-primary hover:text-primary-dark">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  )
}
