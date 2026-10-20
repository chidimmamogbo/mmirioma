/** Query hooks for this browser's push settings. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PushSettings } from '../../domain/push'
import { setPush } from './push'
import { getPushSettings } from './pushApi'

export const pushKeys = { settings: ['push', 'settings'] as const }

/** Push settings for the signed-in user in this browser. Only fetched when push is possible here. */
export const usePushSettings = (enabled = true) => useQuery({ queryKey: pushKeys.settings, queryFn: getPushSettings, enabled })

/** Turn push on or off (asks for permission when turning on). */
export function useSetPush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: PushSettings) => setPush(next),
    onSuccess: (saved) => qc.setQueryData(pushKeys.settings, saved),
  })
}
