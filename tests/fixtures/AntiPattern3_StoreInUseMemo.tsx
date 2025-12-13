/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents the bug from ExportDialog.tsx (commit d285789)
 */
import { useCallback, useMemo } from 'react'

export const AntiPattern3 = ({ minimongoStore, selectedFormat }: any) => {
  // ❌ BAD: Store object in useMemo deps
  const generatePreview = useCallback(() => {
    const data = minimongoStore.exportData()
    return data
  }, [minimongoStore, selectedFormat]) // <-- minimongoStore SHOULD BE DETECTED

  return <div />
}
