import { MessageCircleIcon, MessageSquareIcon, PhoneIcon } from '../../../components/icons/icons'
import { BackLink, MobileShell, ScrollArea, TopBar, TopBarSpacer, TopBarTitle } from '../../../components/layout/MobileShell'
import { ButtonLink, ExternalButton } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { IconBadge } from '../../../components/ui/Content'
import { Notice } from '../../../components/ui/Notice'
import { formatPhone } from '../../../lib/format/phone'
import { WHATSAPP_GREETING, whatsappLink } from '../../../lib/whatsapp'
import { useSupportContact } from '../../marketing/queries'

/**
 * Contact channels behind the Call us / WhatsApp / Chat tiles. Not in the
 * handoff. The phone and WhatsApp come from the backend's support contact
 * (`GET /public/contact`, FR-055); the WhatsApp tile is hidden while WhatsApp
 * support is off. Support hours are not decided yet, so they stay a
 * placeholder in the design's square-bracket style.
 */
export function SupportContact({ back = '/support' }: { back?: string | -1 }) {
  const { phone, whatsapp } = useSupportContact()
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
            <div className="text-[13px] text-slate">{formatPhone(phone)}</div>
          </div>
        </Card>
        {whatsapp && (
          <Card id="whatsapp" className="rise-2 flex flex-col gap-3 p-3.5">
            <div className="flex items-center gap-3">
              <IconBadge tone="teal">
                <MessageCircleIcon size={20} />
              </IconBadge>
              <div className="flex-1">
                <div className="font-extrabold">WhatsApp</div>
                <div className="text-[13px] text-slate">{formatPhone(whatsapp)}</div>
              </div>
            </div>
            <ExternalButton href={whatsappLink(whatsapp, WHATSAPP_GREETING)} variant="alt" size="sm">
              Chat on WhatsApp
            </ExternalButton>
          </Card>
        )}
        <Card id="chat" className="rise-3 flex items-center gap-3 p-3.5">
          <IconBadge tone="blue">
            <MessageSquareIcon size={20} />
          </IconBadge>
          <div className="flex-1">
            <div className="font-extrabold">Chat</div>
            <div className="text-[13px] text-slate">In-app chat is not available yet. Send us a message with the form on Support.</div>
          </div>
        </Card>
        <Notice className="rise-4">Our support hours will be added once they are agreed.</Notice>
        {back === '/support' && (
          <ButtonLink to="/support" variant="alt" className="rise-4">
            Report a problem instead
          </ButtonLink>
        )}
      </ScrollArea>
    </MobileShell>
  )
}
