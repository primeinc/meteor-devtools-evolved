/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents the bug from Navigation.tsx
 */
import { useEffect } from 'react'

export const AntiPattern6 = ({ panelStore }: any) => {
  // ❌ BAD: Nested store property in deps
  useEffect(() => {
    setTimeout(() => {
      panelStore.settingStore.updateRepositoryData()
    }, 1000)
  }, [panelStore.settingStore]) // <-- THIS SHOULD BE DETECTED

  return <div />
}
