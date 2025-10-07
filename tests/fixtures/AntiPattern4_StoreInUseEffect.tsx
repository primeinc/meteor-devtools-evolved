/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents a common useEffect anti-pattern with MobX stores
 */
import { useEffect } from 'react'

export const AntiPattern4 = ({ panelStore }: any) => {
  // ❌ BAD: Store object in useEffect deps
  useEffect(() => {
    panelStore.initialize()
  }, [panelStore]) // <-- THIS SHOULD BE DETECTED

  return <div />
}
