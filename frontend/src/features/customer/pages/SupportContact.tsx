import { MessageCircleIcon, MessageSquareIcon, PhoneIcon } from '../../../components/icons/icons'
import { BackLink, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { ButtonLink } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { IconBadge } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'

/**
 * Contact channels behind the Call us / WhatsApp / Chat tiles. Not in the
 * handoff. The support numbers and hours are not decided yet, so they are
 * shown as placeholders in the design's square-bracket style; the screen
 * never invents a number to dial.
 */
export function SupportContact({ back = '/support' }: { back?: string | -1 }) {
  return (
    <MobileShell>
      <TopBar left={<BackLink to={back} />} center={<TopBarTitle>Contact us</TopBarTitle>} right={<TopBarSpacer />} />
      <ScrollArea className="gap-3">
        <p className="rise-1 m-0 text-sub text-mute">Our team answers during [SUPPORT HOURS].</p>
        <Card id="call" className="rise-2 flex items-center gap-3 p-3.5">
          <IconBadge tone="green">
            <PhoneIcon size={20} />
          </IconBadge>
          <div className="flex-1">
            <div className="font-extrabold">Call us</div>
            <div className="text-[13px] text-slate">[SUPPORT PHONE NUMBER]</div>
          </div>
        </Card>
        <Card id="whatsapp" className="rise-2 flex items-center gap-3 p-3.5">
          <IconBadge tone="teal">
            <MessageCircleIcon size={20} />
          </IconBadge>
          <div className="flex-1">
            <div className="font-extrabold">WhatsApp</div>
            <div className="text-[13px] text-slate">[WHATSAPP NUMBER]</div>
          </div>
        </Card>
        <Card id="chat" className="rise-3 flex items-center gap-3 p-3.5">
          <IconBadge tone="blue">
            <MessageSquareIcon size={20} />
          </IconBadge>
          <div className="flex-1">
            <div className="font-extrabold">Chat</div>
            <div className="text-[13px] text-slate">In-app chat is not available yet. Send us a message with the form on Support.</div>
          </div>
        </Card>
        <Notice className="rise-4">These contact details will be added once the support line is set up.</Notice>
        {back === '/support' && (
          <ButtonLink to="/support" variant="alt" className="rise-4">
            Report a problem instead
          </ButtonLink>
        )}
      </ScrollArea>
    </MobileShell>
  )
}
