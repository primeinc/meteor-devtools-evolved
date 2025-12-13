/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * Multiple store objects in dependency arrays
 */
import { useCallback, useEffect } from 'react'

export const AntiPattern5 = ({ ddpStore, settingStore, panelStore }: any) => {
  // ❌ BAD: Multiple store objects
  const handleFilter = useCallback(
    (type) => settingStore.setFilter(type, true),
    [settingStore], // <-- SHOULD BE DETECTED
  )

  // ❌ BAD: Another store in useEffect
  useEffect(() => {
    ddpStore.loadData()
  }, [ddpStore]) // <-- SHOULD BE DETECTED

  return <div />
}
