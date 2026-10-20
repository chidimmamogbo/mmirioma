import { Illustration } from '../components/brand/Illustration'
import { Footer, MobileShell, ScrollArea, TopBar } from '../components/layout/MobileShell'
import { ButtonLink } from '../components/ui/Button'

/**
 * Shown for any address that is not a page. Built from the existing screen
 * pattern (top bar, centred illustration, footer button); not in the handoff.
 */
export function NotFound() {
  return (
    <MobileShell>
      <TopBar />
      <ScrollArea className="items-center justify-center text-center">
        <Illustration name="jerrycan" className="animate-float h-24" />
        <h1 className="m-0 text-title font-extrabold">We cannot find that page</h1>
        <p className="m-0 text-sub text-mute">The link may be old or mistyped.</p>
      </ScrollArea>
      <Footer>
        <ButtonLink to="/app">Go to the start</ButtonLink>
      </Footer>
    </MobileShell>
  )
}
