import browser from 'webextension-polyfill'

interface ExportChunk {
  type: 'export-chunk'
  token: string
  chunkIndex: number
  totalChunks: number
  data: string
  isLast: boolean
}

interface ExportInit {
  type: 'export-init'
  token: string
  filename: string
  totalChunks: number
}

interface ExportAbort {
  type: 'export-abort'
  token: string
}

type ExportMessage = ExportChunk | ExportInit | ExportAbort

interface ExportState {
  token: string
  filename: string
  chunks: Map<number, string>
  totalChunks: number
  receivedChunks: number
  aborted: boolean
}

const activeExports = new Map<string, ExportState>()

const createDownload = (filename: string, data: string) => {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const handleExportInit = (message: ExportInit, senderId: string) => {
  if (!message.token) {
    console.error('Export init missing token')
    return
  }

  // Clear any existing export with this token
  if (activeExports.has(message.token)) {
    const state = activeExports.get(message.token)
    state.chunks.clear()
  }

  activeExports.set(message.token, {
    token: message.token,
    filename: message.filename,
    chunks: new Map(),
    totalChunks: message.totalChunks,
    receivedChunks: 0,
    aborted: false,
  })

  console.debug(`Export initialized: ${message.filename}, ${message.totalChunks} chunks`)
}

const handleExportChunk = (message: ExportChunk, senderId: string) => {
  const state = activeExports.get(message.token)

  if (!state) {
    console.error('Export chunk received without init')
    return
  }

  if (state.aborted) {
    console.debug('Export chunk ignored - export was aborted')
    return
  }

  if (state.token !== message.token) {
    console.error('Token mismatch in export chunk')
    return
  }

  // Store the chunk
  state.chunks.set(message.chunkIndex, message.data)
  state.receivedChunks++

  // Immediately clear the message data to free memory
  message.data = null

  console.debug(
    `Chunk ${message.chunkIndex + 1}/${message.totalChunks} received (${state.receivedChunks}/${state.totalChunks})`,
  )

  // Check if we have all chunks
  if (state.receivedChunks === state.totalChunks && message.isLast) {
    // Assemble the data
    const parts: string[] = []
    for (let i = 0; i < state.totalChunks; i++) {
      const chunk = state.chunks.get(i)
      if (!chunk) {
        console.error(`Missing chunk ${i}`)
        activeExports.delete(message.token)
        return
      }
      parts.push(chunk)
    }

    const fullData = parts.join('')
    console.debug(`Export complete: ${state.filename}`)

    // Create download
    createDownload(state.filename, fullData)

    // Clean up
    state.chunks.clear()
    activeExports.delete(message.token)
  }
}

const handleExportAbort = (message: ExportAbort, senderId: string) => {
  const state = activeExports.get(message.token)

  if (!state) {
    console.debug('Abort received for unknown export')
    return
  }

  if (state.token !== message.token) {
    console.error('Token mismatch in export abort')
    return
  }

  console.debug(`Export aborted: ${state.filename}`)
  state.aborted = true
  state.chunks.clear()
  activeExports.delete(message.token)
}

// Message handler
browser.runtime.onMessage.addListener((message: ExportMessage, sender) => {
  const senderId = sender.id

  // Verify sender is from our extension
  if (senderId !== browser.runtime.id) {
    console.error('Message from unauthorized sender')
    return
  }

  switch (message.type) {
    case 'export-init':
      handleExportInit(message, senderId)
      break
    case 'export-chunk':
      handleExportChunk(message, senderId)
      break
    case 'export-abort':
      handleExportAbort(message, senderId)
      break
    default:
      console.warn('Unknown message type:', message)
  }
})

console.debug('Offscreen document ready for exports')
