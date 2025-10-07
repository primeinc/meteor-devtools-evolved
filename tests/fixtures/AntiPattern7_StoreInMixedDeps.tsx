/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents the bug from Minimongo.tsx
 */
import { useEffect } from 'react'

export const AntiPattern7 = ({ minimongoStore, collectionNamesSet }: any) => {
  // ❌ BAD: Store object mixed with valid deps
  useEffect(() => {
    const isActiveCollectionMissing =
      minimongoStore.activeCollection &&
      !collectionNamesSet.has(minimongoStore.activeCollection)

    if (isActiveCollectionMissing) {
      minimongoStore.setActiveCollection(null)
    }
  }, [minimongoStore.activeCollection, collectionNamesSet, minimongoStore]) // <-- minimongoStore SHOULD BE DETECTED

  return <div />
}
