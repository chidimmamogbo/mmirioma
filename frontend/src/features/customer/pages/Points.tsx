import { Illustration } from '../../../components/brand/Illustration'
import { DropletIcon, StarIcon, TagIcon } from '../../../components/icons/icons'
import { BackLink, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/layout/StateScreens'
import { ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { SampleTag } from '../../../components/ui/Chip'
import { IconBadge, SectionHeader } from '../../../components/ui/Content'
import type { PointsEntry } from '../../../domain/orders'
import { formatNaira } from '../../../lib/format/money'
import { usePoints } from '../queries'

const ENTRY_STYLE: Record<PointsEntry['kind'], { tone: 'green' | 'red' | 'violet' | 'gold'; mark: string; color: string }> = {
  earned: { tone: 'green', mark: '+', color: 'text-green' },
  redeemed: { tone: 'red', mark: '−', color: 'text-red' },
  adjusted: { tone: 'violet', mark: '±', color: 'text-violet' },
  bonus: { tone: 'gold', mark: '★', color: 'text-green' },
}

/** My points (`c-points`). Loyalty rules are samples (decision 16). */
export function Points() {
  const points = usePoints()
  const p = points.data
  const progress = p ? Math.min(1, p.balance / p.next_reward.target) : 0

  return (
    <MobileShell>
      <TopBar left={<BackLink to="/menu" />} center={<TopBarTitle>My points</TopBarTitle>} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        {points.isPending && <LoadingBlock label="Loading your points" />}
        {points.isError && <ErrorBlock error={points.error} onRetry={() => points.refetch()} />}
        {p && (
          <>
            <div className="rise-1 relative box-border min-h-[172px] overflow-hidden rounded-hero bg-[linear-gradient(135deg,#FFF7E2_0%,#FFE2A0_100%)] p-[18px]">
              <Illustration name="gift" className="animate-float absolute top-1 right-[-10px] w-[170px]" />
              <div className="relative max-w-[190px]">
                <div className="text-[13px] font-bold text-[#6B4A00]">Your balance</div>
                <div className="animate-pop text-[44px] leading-[1.1] font-extrabold tracking-[-1.5px]">{p.balance}</div>
                <div className="text-[13px] text-[#5A4310]">points · worth {formatNaira(p.balance_value_minor_units)} off</div>
              </div>
              <div className="relative mt-3.5">
                <div className="flex justify-between text-chip font-bold text-[#5A4310]">
                  <span>Next reward: {p.next_reward.label}</span>
                  <span>
                    {Math.min(p.balance, p.next_reward.target)} / {p.next_reward.target}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Progress to ${p.next_reward.label}`}
                  aria-valuemin={0}
                  aria-valuemax={p.next_reward.target}
                  aria-valuenow={Math.min(p.balance, p.next_reward.target)}
                  className="mt-1.5 h-2.5 overflow-hidden rounded-sample bg-white/70"
                >
                  {/* The outer layer sets the progress (scaleX, not width, so only transform
                      changes); the inner layer plays the grow-in and the shine. */}
                  <div className="h-full origin-left" style={{ transform: `scaleX(${progress})` }}>
                    <div className="shine animate-grow-x h-full w-full rounded-sample bg-[#E5A21A]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="rise-2 grid grid-cols-3 gap-2">
              <div className="mo-tile min-h-[84px] cursor-default">
                <IconBadge tone="blue" size={34}>
                  <DropletIcon size={18} strokeWidth={2.2} roundJoin={false} />
                </IconBadge>
                Order water
              </div>
              <div className="mo-tile min-h-[84px] cursor-default">
                <IconBadge tone="gold" size={34}>
                  <StarIcon size={18} filled />
                </IconBadge>
                Earn points
              </div>
              <div className="mo-tile min-h-[84px] cursor-default">
                <IconBadge tone="green" size={34}>
                  <TagIcon size={18} strokeWidth={2.2} roundJoin={false} />
                </IconBadge>
                Save money
              </div>
            </div>
            <ButtonLink className="rise-2" to="/order">
              Use points on my next order
            </ButtonLink>
            <SectionHeader className="rise-3" title="History" action={p.is_sample ? <SampleTag>SAMPLE RULES</SampleTag> : undefined} />
            {p.history.length === 0 ? (
              <EmptyBlock illustration="gift" title="No points yet" text="You earn points when an order is delivered." />
            ) : (
              <Card className="rise-3 px-3.5 py-1">
                {p.history.map((h) => {
                  const st = ENTRY_STYLE[h.kind]
                  return (
                    <div key={h.id} className="mo-li">
                      <IconBadge tone={st.tone} size={36}>
                        <span aria-hidden="true" className="font-extrabold">
                          {st.mark}
                        </span>
                      </IconBadge>
                      <div className="flex-1">
                        <div className="text-sub font-bold">{h.label}</div>
                        <div className="text-chip text-mute">{h.at}</div>
                      </div>
                      <span className={`font-extrabold ${st.color}`}>
                        {h.points > 0 ? `+${h.points}` : `−${Math.abs(h.points)}`}
                      </span>
                    </div>
                  )
                })}
              </Card>
            )}
          </>
        )}
      </ScrollArea>
    </MobileShell>
  )
}
