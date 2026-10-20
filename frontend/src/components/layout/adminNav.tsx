import type { ReactNode } from 'react'
import {
  BarChartIcon,
  CreditCardIcon,
  DocumentFoldIcon,
  HomeSolidIcon,
  MapIcon,
  MessageSquareIcon,
  StarIcon,
  StationDoorIcon,
  SunIcon,
  TagDotIcon,
  UsersIcon,
  VehicleIcon,
  WalletIcon,
} from '../icons/icons'

/** Sidebar entry. Icons follow the dashboard page of the handoff (the canonical nav). */
export interface NavEntry {
  to: string
  label: string
  icon: (current: boolean) => ReactNode
  /** Key into `counts` for the red badge. */
  countKey?: 'orders' | 'support'
}

export const ADMIN_NAV: NavEntry[] = [
  { to: '/admin', label: 'Dashboard', icon: (on) => <HomeSolidIcon filled={on} /> },
  { to: '/admin/orders', label: 'Orders', icon: () => <DocumentFoldIcon />, countKey: 'orders' },
  { to: '/admin/customers', label: 'Customers', icon: () => <UsersIcon roundJoin={false} /> },
  { to: '/admin/riders', label: 'Riders', icon: () => <VehicleIcon /> },
  { to: '/admin/stations', label: 'Refill stations', icon: () => <StationDoorIcon /> },
  { to: '/admin/areas', label: 'Service areas', icon: () => <MapIcon /> },
  { to: '/admin/pricing', label: 'Pricing and delivery', icon: () => <TagDotIcon /> },
  { to: '/admin/loyalty', label: 'Loyalty points', icon: () => <StarIcon /> },
  { to: '/admin/payments', label: 'Payments', icon: () => <CreditCardIcon /> },
  { to: '/admin/earnings', label: 'Rider earnings', icon: () => <WalletIcon /> },
  { to: '/admin/reports', label: 'Reports', icon: () => <BarChartIcon roundJoin={false} /> },
  { to: '/admin/support', label: 'Support', icon: () => <MessageSquareIcon />, countKey: 'support' },
  { to: '/admin/settings', label: 'Settings', icon: () => <SunIcon roundJoin={false} /> },
]

/** The nav entry a path belongs to: exact for the dashboard, prefix for the rest. */
export function currentNavPath(pathname: string): string | undefined {
  if (pathname === '/admin' || pathname === '/admin/') return '/admin'
  return ADMIN_NAV.filter((n) => n.to !== '/admin' && pathname.startsWith(n.to)).sort((a, b) => b.to.length - a.to.length)[0]
    ?.to
}
