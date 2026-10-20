import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Wave } from '../../../components/art/Art'
import { Illustration } from '../../../components/brand/Illustration'
import { Logo } from '../../../components/brand/Logo'
import { AlertCircleIcon } from '../../../components/icons/icons'
import { MobileShell, ScrollArea } from '../../../components/layout/MobileShell'
import { Button } from '../../../components/ui/Button'
import { ScreenHeading } from '../../../components/ui/Content'
import { TextField } from '../../../components/ui/Field'
import { Notice } from '../../../components/ui/Notice'
import { ApiError } from '../../../lib/api/client'
import { errorMessage } from '../../../lib/api/errorMessage'
import { phoneField, retryAfterSeconds } from '../../../lib/forms'
import { HOME_PATH } from '../../auth/authPaths'
import { useLogin } from '../../auth/useSession'

const schema = z.object({ phone: phoneField, password: z.string().min(1, 'Enter your password.') })
type Values = z.infer<typeof schema>

/**
 * Staff sign-in (`/admin/login`). No design exists; built from the rider
 * login (`r-login`, decision 8). Staff accounts are created by the team's
 * command-line tool (auth.md), so there is no sign-up and no self-service
 * password reset here.
 */
export function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const login = useLogin()
  const {
    register,
    handleSubmit,
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
    <MobileShell background="white">
      <div className="relative h-[280px] shrink-0 overflow-hidden bg-[linear-gradient(160deg,#0A2540_0%,#0B4FA8_55%,#1570D8_100%)]">
        <Illustration name="drop-hero" className="absolute top-5 right-[-60px] h-[240px] w-auto max-w-none opacity-30 mix-blend-screen" />
        <div className="rise-1 absolute top-7 left-6 rounded-icon bg-white px-3 py-2">
          <Logo height={30} />
        </div>
        <div className="rise-2 absolute top-[104px] left-6 text-white">
          <div className="text-[13px] font-bold tracking-[0.6px] text-[#CFE3FB] uppercase">Staff dashboard</div>
          <div className="mt-1.5 text-[28px] leading-[1.15] font-extrabold tracking-[-0.5px]">
            Orders, riders
            <br />
            and stations.
          </div>
        </div>
        <Wave fill="#FFFFFF" className="bottom-[-1px]" />
      </div>
      <ScrollArea className="gap-3.5 px-[22px] pt-2 pb-[22px]">
        <ScreenHeading className="rise-3" title="Staff sign in" sub="For MmiriOma admins, dispatchers and support." />
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
          {login.isError && <Notice tone="error">{message}</Notice>}
          <TextField
            className="rise-3"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0800 000 0000"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            className="rise-4"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" className="rise-4" loading={login.isPending}>
            Sign in
          </Button>
        </form>
        <div className="rise-5 flex items-start gap-2.5 rounded-icon bg-sky p-3 text-caption text-[#0B3A75]">
          <AlertCircleIcon size={18} color="#1570D8" roundJoin={false} className="shrink-0" />
          <span>Staff accounts are set up by the MmiriOma team. Forgot your password? Ask your team lead to reset it.</span>
        </div>
      </ScrollArea>
    </MobileShell>
  )
}
