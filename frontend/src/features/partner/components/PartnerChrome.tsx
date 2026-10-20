import type { ReactNode } from 'react'
import { BottomTabBar } from '../../../components/layout/BottomTabBar'
import { MenuLink, NotificationsLink, ProfileLink, TopBar } from '../../../components/layout/MobileShell'
import { DocumentFoldIcon, DocumentLinesIcon, HomeSolidIcon, PersonIcon, WalletIcon } from '../../../components/icons/icons'
import { Chip } from '../../../components/ui/Chip'
import { usePartnerApp } from '../partnerContext'
import { usePartnerNotifications, usePartnerProfile } from '../queries'

/** Rider and driver bottom tabs (`r-home`, `t-home`): Home, Orders, Earnings, Profile (menu). */
export function PartnerTabs({ current }: { current: 'home' | 'orders' | 'earnings' }) {
  const { base, role } = usePartnerApp()
  const OrdersIcon = role === 'rider' ? DocumentLinesIcon : DocumentFoldIcon
  const items = [
    { to: base, label: 'Home', icon: (on: boolean) => <HomeSolidIcon size={22} filled={on} /> },
    { to: `${base}/orders`, label: 'Orders', icon: () => <OrdersIcon size={22} /> },
    { to: `${base}/earnings`, label: 'Earnings', icon: () => <WalletIcon size={22} /> },
    { to: `${base}/menu`, label: 'Profile', icon: () => <PersonIcon size={22} roundJoin={false} /> },
  ]
  const currentPath = current === 'home' ? base : current === 'orders' ? `${base}/orders` : `${base}/earnings`
  return <BottomTabBar label={role === 'rider' ? 'Rider' : 'Driver'} items={items} current={currentPath} />
}

/** Home top bar for partners: menu, logo, notifications, avatar. */
export function PartnerHomeTopBar() {
  const { base } = usePartnerApp()
  const profile = usePartnerProfile()
  const notes = usePartnerNotifications()
  const unread = notes.data?.filter((n) => !n.read).length ?? 0
  return (
    <TopBar
      left={<MenuLink to={`${base}/menu`} />}
      right={
        <div className="flex items-center gap-1">
          <NotificationsLink to={`${base}/notifications`} unread={unread} />
          <ProfileLink to={`${base}/menu`} name={profile.data?.name ?? '·'} />
        </div>
      }
    />
  )
}

/** Small blue chip in the top bar's right slot ("Step 1 of 2", "At station"). */
export function StepChip({ children }: { children: ReactNode }) {
  return <Chip>{children}</Chip>
}
