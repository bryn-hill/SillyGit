import { useEffect, useEffectEvent, useState } from 'react'
import type { IpcResult } from '../lib/ipc'

/**
 * A setting kept by the main process: `initial` until it loads, then saved on
 * every change. A failed save is reported through `onError`.
 */
export function useSavedSetting<T, I = T>(
  load: () => Promise<T>,
  save: (value: T) => Promise<IpcResult<unknown>>,
  initial: I,
  onError: (message: string) => void
): [T | I, (next: T) => void] {
  const [value, setValue] = useState<T | I>(initial)
  const loadSetting = useEffectEvent(() => {
    load().then(setValue)
  })
  useEffect(() => loadSetting(), [])
  const change = (next: T): void => {
    setValue(next)
    save(next).then((res) => !res.ok && onError(res.error))
  }
  return [value, change]
}
