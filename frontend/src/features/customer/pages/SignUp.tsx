import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '../../../components/brand/Logo'
import { BackLink, MobileShell, ScrollArea, TopBar } from '../../../components/layout/MobileShell'
import { Button } from '../../../components/ui/Button'
import { ScreenHeading } from '../../../components/ui/Content'
import { PageTabs } from '../../../components/ui/Controls'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { applyServerFieldErrors, newPasswordField, phoneField, retryAfterSeconds } from '../../../lib/forms'
import { useRegister } from '../../auth/useSession'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your full name.').max(100, 'Use 100 characters or fewer.'),
  phone: phoneField,
  password: newPasswordField,
})
type Values = z.infer<typeof schema>

/**
 * Create a customer account (`c-signup`): name, phone and password only.
 * Google sign-up and the email field are removed (decision 6); email can be
 * added later in the profile. The design's "Verify phone" step is skipped
 * (decision 7): new accounts go straight to home, and staff verify the phone
 * manually before confirming an order (FR-003).
 */
export function SignUp() {
  const navigate = useNavigate()
  const registerMutation = useRegister()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit((values) =>
    registerMutation.mutate(values, {
      onSuccess: () => navigate('/home', { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'phone_already_registered') {
          setError('phone', { message: 'This number already has an account. Sign in instead.' })
        } else {
          applyServerFieldErrors(error, setError, { name: 'name', phone: 'phone', password: 'password' })
        }
      },
    }),
  )

  const err = registerMutation.error
  const fieldLevel = err instanceof ApiError && (err.code === 'phone_already_registered' || err.code === 'validation_error')
  const wait = retryAfterSeconds(err)

  return (
    <MobileShell background="white">
      <TopBar className="border-b-0" left={<BackLink to="/signin" />} />
      <ScrollArea className="gap-3.5 px-[22px] pt-2 pb-[22px]">
        <div className="rise-1 flex items-center gap-3.5">
          <Logo variant="mark" height={75} alt="" className="animate-float" />
          <ScreenHeading title="Create your account" sub="It takes less than a minute." />
        </div>
        <div className="rise-2">
          <PageTabs
            variant="blue"
            label="Account"
            tabs={[
              { to: '/signin', label: 'Sign in', current: false },
              { to: '/signup', label: 'Create account', current: true },
            ]}
          />
        </div>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
          {registerMutation.isError && !fieldLevel && (
            <Notice tone="error">
              {wait !== null ? `Too many tries. Wait ${Math.max(1, Math.ceil(wait / 60))} minutes, then try again.` : errorMessage(err)}
            </Notice>
          )}
          <TextField
            className="rise-3"
            label="Full name"
            autoComplete="name"
            placeholder="e.g. Adaeze Nwosu"
            error={errors.name?.message}
            {...register('name')}
          />
          <TextField
            className="rise-3"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            hint="We send delivery codes to this number."
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            className="rise-4"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" className="rise-5" loading={registerMutation.isPending}>
            Create account
          </Button>
        </form>
        <p className="rise-5 m-0 text-center text-chip text-mute">
          By signing up you agree to our{' '}
          <Link to="/terms" className="text-mute underline hover:text-ink">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-mute underline hover:text-ink">
            Privacy Notice
          </Link>
          .
        </p>
        <p className="m-0 text-center text-[13px] text-slate">
          Register as a driver?{' '}
          <Link to="/partner/signup" className="font-bold text-primary no-underline hover:text-primary-dark">
            Click here
          </Link>
        </p>
      </ScrollArea>
    </MobileShell>
  )
}
