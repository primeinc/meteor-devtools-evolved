// src/Pages/Panel/Minimongo/services/ClipboardService.ts
import { Intent } from '@blueprintjs/core'
import { AppToaster } from '@/AppToaster'

const MAX_COPY_BYTES = 5 * 1024 * 1024 // 5 MB

export async function copyText(label: string, text: string): Promise<void> {
  const size = new TextEncoder().encode(text).length
  if (size > MAX_COPY_BYTES) {
    AppToaster.show({
      message: `Copy blocked: ${Math.round(
        size / (1024 * 1024),
      )} MB exceeds 5 MB limit.`,
      intent: Intent.WARNING,
      timeout: 4000,
    })
    return
  }

  try {
    // DevTools panels don't support navigator.clipboard due to permissions policy
    // Use execCommand('copy') which works in all contexts
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-10000px'
    ta.style.top = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()

    const success = document.execCommand('copy')
    document.body.removeChild(ta)

    if (!success) {
      throw new Error('execCommand("copy") returned false')
    }

    AppToaster.show({
      message: `Copied: ${label}`,
      intent: Intent.SUCCESS,
      timeout: 2000,
    })
  } catch (e: any) {
    AppToaster.show({
      message: `Copy failed: ${e?.message || e}`,
      intent: Intent.DANGER,
      timeout: 3000,
    })
    throw e
  }
}
