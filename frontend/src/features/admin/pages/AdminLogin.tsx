import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Illustration } from '../../../components/brand/Illustration'
import { Logo } from '../../../components/brand/Logo'
import { AlertCircleIcon } from '../../../components/icons/icons'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { USE_MOCKS } from '../../../lib/api/mode'
import { phoneField, retryAfterSeconds } from '../../../lib/forms'
import { HOME_PATH } from '../../auth/authPaths'
import { useLogin } from '../../auth/useSession'


/**
 * The demo staff account's phone and password, read on click and only in mock mode: they must not be in a build
 * without mocks, where anyone can read the JavaScript (#236).
 */
const loadDemoAccount = async () => {
  if (!__USE_MOCKS__) throw new Error('The demo account is not part of this build.')
  const { DEMO_ADMIN_PHONE, DEMO_PASSWORD } = await import('../../../mocks/seed')
  return { DEMO_ADMIN_PHONE, DEMO_PASSWORD }
}
const schema = z.object({ phone: phoneField, password: z.string().min(1, 'Enter your password.') })
type Values = z.infer<typeof schema>

/**
 * Staff sign-in (`/admin/login`). No design exists; built from the rider
 * login (`r-login`, decision 8) and laid out for every screen: a brand panel
 * beside the form on laptops and desktops (where staff mostly work), stacked
 * above it on tablets and phones. Staff accounts are created by the team's
 * command-line tool (auth.md), so there is no sign-up or self-service reset.
 */
export function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const login = useLogin()
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit((v) =>
    login.mutate(v, {
      onSuccess: (s) => navigate(from && s.user.role === 'admin' ? from : HOME_PATH[s.user.role], { replace: true }),
    }),
  )

  const wait = retryAfterSeconds(login.error)
  const message =
    wait !== null
      ? `Too many tries. Wait ${Math.max(1, Math.ceil(wait / 60))} minutes, then try again.`
      : login.error instanceof ApiError && login.error.code === 'invalid_credentials'
        ? 'That phone number or password is not right.'
        : errorMessage(login.error)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink lg:flex-row">
      <section className="relative flex shrink-0 flex-col justify-between gap-6 overflow-hidden bg-[linear-gradient(160deg,#0A2540_0%,#0B4FA8_55%,#1570D8_100%)] px-6 pt-6 pb-8 text-white sm:px-10 lg:w-[46%] lg:max-w-[640px] lg:px-14 lg:py-12">
        <Illustration name="drop-hero" className="pointer-events-none absolute top-0 right-[-80px] h-full w-auto max-w-none opacity-25 mix-blend-screen" />
        <div className="rise-1 relative self-start rounded-icon bg-white px-3 py-2">
          <Logo height={32} />
        </div>
        <div className="rise-2 relative">
          <div className="text-[13px] font-bold tracking-[0.6px] text-[#CFE3FB] uppercase">Staff dashboard</div>
          <h1 className="mt-2 mb-0 text-[28px] leading-[1.15] font-extrabold tracking-[-0.5px] sm:text-[34px] lg:text-[44px]">
            Orders, riders
            <br />
            and stations.
          </h1>
          <p className="mt-3 mb-0 hidden max-w-[420px] text-[16px] leading-[1.55] text-[#DCEBFD] sm:block">
            Assign riders, confirm payments, keep refill stations open and sort out delivery problems, all in one place.
          </p>
        </div>
        <div className="relative hidden items-end gap-4 lg:flex">
          <Illustration name="keke" className="animate-drive w-[170px] drop-shadow-[0_10px_12px_rgba(0,0,0,0.25)]" />
          <Illustration name="tanker" className="animate-drive w-[210px] drop-shadow-[0_10px_12px_rgba(0,0,0,0.25)]" />
        </div>
      </section>

      <main className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:px-10">
        <div className="rise-3 flex w-full max-w-[420px] flex-col gap-4 rounded-card bg-white p-6 shadow-stat sm:p-8">
          <div>
            <h2 className="m-0 text-[24px] font-extrabold">Staff sign in</h2>
            <p className="mt-1 mb-0 text-mute">For MmiriOma admins, dispatchers and support.</p>
          </div>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {login.isError && <Notice tone="error">{message}</Notice>}
            <TextField label="Phone number" type="tel" inputMode="tel" autoComplete="username" placeholder="0800 000 0000" error={errors.phone?.message} {...register('phone')} />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" loading={login.isPending}>
              Sign in
            </Button>
          </form>
          {USE_MOCKS && (
            <div className="flex flex-col gap-2 rounded-icon border border-dashed border-input-line p-3 text-caption text-slate">
              <span>
                <b>Mock mode:</b> sample data in this browser only. Fill in the demo staff account to look around.
              </span>
              <Button
                variant="alt"
                size="sm"
                onClick={async () => {
                  const { DEMO_ADMIN_PHONE, DEMO_PASSWORD } = await loadDemoAccount()
                  setValue('phone', DEMO_ADMIN_PHONE, { shouldValidate: true })
                  setValue('password', DEMO_PASSWORD, { shouldValidate: true })
                }}
              >
                Use demo staff account
              </Button>
            </div>
          )}
          <div className="flex items-start gap-2.5 rounded-icon bg-sky p-3 text-caption text-[#0B3A75]">
            <AlertCircleIcon size={18} color="#1570D8" roundJoin={false} className="shrink-0" />
            <span>Staff accounts are set up by the MmiriOma team. Forgot your password? Ask your team lead to reset it.</span>
          </div>
        </div>
      </main>
    </div>
  )
}
