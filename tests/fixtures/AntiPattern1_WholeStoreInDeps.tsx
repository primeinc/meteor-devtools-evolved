/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents the bug from BookmarksStatus.tsx (commit d285789)
 */
import { useCallback } from 'react'

export const AntiPattern1 = ({ settingStore }: any) => {
  // ❌ BAD: Entire store object in deps
  const setFilter = useCallback(
    (type, isEnabled) => settingStore.setFilter(type, isEnabled),
    [settingStore], // <-- THIS SHOULD BE DETECTED
  )

  return <div onClick={() => setFilter('bookmark', true)} />
}
