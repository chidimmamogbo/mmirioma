import { BottomTabBar } from '../../../components/layout/BottomTabBar'
import { MenuLink, NotificationsLink, ProfileLink, TopBar } from '../../../components/layout/MobileShell'
import { CartIcon, DocumentLinesIcon, DocumentSolidIcon, HomeSolidIcon, PersonIcon } from '../../../components/icons/icons'
import { useSession } from '../../auth/useSession'
import { useNotifications, useProfile } from '../queries'

const TABS = [
  { to: '/home', label: 'Home', icon: (on: boolean) => <HomeSolidIcon size={22} filled={on} /> },
  { to: '/order', label: 'Order', icon: () => <CartIcon size={22} /> },
  {
    to: '/orders',
    label: 'Orders',
    icon: (on: boolean) => (on ? <DocumentSolidIcon size={22} filled /> : <DocumentLinesIcon size={22} />),
  },
  { to: '/profile', label: 'Profile', icon: () => <PersonIcon size={22} roundJoin={false} /> },
]

/** The customer bottom tab bar (`.tabs` on c-home and c-orders). */
export function CustomerTabs({ current }: { current: '/home' | '/order' | '/orders' | '/profile' }) {
  return <BottomTabBar label="Main" items={TABS} current={current} />
}

/**
 * Top bar of the customer home screens: menu, logo, notifications (with the
 * unread dot) and the profile avatar. Set `bell={false}` for screens that
 * show only the avatar on the right (c-orders).
 */
export function CustomerTopBar({ bell = true }: { bell?: boolean }) {
  const profile = useProfile()
  const notifications = useNotifications()
  const unread = notifications.data?.unread_count ?? 0
  const session = useSession()
  const name = profile.data?.name ?? session.data?.user.name ?? ''
  return (
    <TopBar
      left={<MenuLink to="/menu" />}
      right={
        <div className="flex items-center gap-1">
          {bell && <NotificationsLink to="/notifications" unread={unread} />}
          <ProfileLink to="/menu" name={name || '·'} />
        </div>
      }
    />
  )
}
