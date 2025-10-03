import browser from 'webextension-polyfill'

console.log('[Meteor DevTools] Content.ts running on', location.href)

const messageHandler = (event: MessageEvent) => {
  // Only accept messages from same frame
  if (event.source !== window) return

  // Only accept messages that we know are ours
  if (event.data.source !== 'meteor-devtools-evolved') return

  browser.runtime.sendMessage(event.data).catch(() => {
    // Cleans up and prevent "context invalidated" errors.
    window.removeEventListener('message', messageHandler)
  })
}

window.addEventListener('message', messageHandler)

const url = browser.runtime.getURL('/dist/inject.js')
const script = document.createElement('script')
script.setAttribute('type', 'text/javascript')
script.setAttribute('src', url)
console.log('[Meteor DevTools] Injecting script:', url)
document.documentElement.prepend(script)
script.onload = () => console.log('[Meteor DevTools] Inject script loaded')
script.onerror = (e) => console.error('[Meteor DevTools] Inject script failed to load', e)
