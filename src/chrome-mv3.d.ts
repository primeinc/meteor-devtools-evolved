// Chrome MV3 API type extensions
// These are newer APIs not yet in @types/chrome

import type { Runtime } from 'webextension-polyfill'

declare global {
  namespace chrome {
    export namespace offscreen {
      export interface CreateParameters {
        url: string
        reasons: Reason[]
        justification: string
      }

      export type Reason =
        | 'AUDIO_PLAYBACK'
        | 'BLOBS'
        | 'CLIPBOARD'
        | 'DOM_PARSER'
        | 'DOM_SCRAPING'
        | 'IFRAME_SCRIPTING'
        | 'LOCAL_STORAGE'
        | 'MATCH_MEDIA'
        | 'OFFSCREEN_CANVAS'
        | 'USER_MEDIA'
        | 'WEB_RTC'

      export function createDocument(
        parameters: CreateParameters,
        callback?: () => void,
      ): Promise<void>

      export function closeDocument(callback?: () => void): Promise<void>

      export function hasDocument(
        callback?: (result: boolean) => void,
      ): Promise<boolean>
    }
  }

  // Type alias for Port that works with both chrome and browser APIs
  type RuntimePort = chrome.runtime.Port | Runtime.Port
}

export {}
