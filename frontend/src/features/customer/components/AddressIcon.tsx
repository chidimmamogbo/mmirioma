import { BriefcaseIcon, HeartIcon, HomeSolidIcon, MapPinIcon } from '../../../components/icons/icons'
import { IconBadge, type IconBadgeTone } from '../../../components/ui/Content'

/**
 * Icon badge for a saved address, as drawn in `c-address-pick` and `c-saved`:
 * Home (blue house), Office (violet briefcase), Mum's House (red heart);
 * any other name gets a green pin.
 */
export function AddressIcon({ label }: { label: string }) {
  const key = label.trim().toLowerCase()
  let tone: IconBadgeTone = 'green'
  let icon = <MapPinIcon size={20} />
  if (key === 'home') {
    tone = 'blue'
    icon = <HomeSolidIcon size={20} />
  } else if (key === 'office' || key === 'shop') {
    tone = 'violet'
    icon = <BriefcaseIcon size={20} />
  } else if (key.includes('mum') || key.includes('mom') || key.includes('family')) {
    tone = 'red'
    icon = <HeartIcon size={20} />
  }
  return <IconBadge tone={tone}>{icon}</IconBadge>
}
