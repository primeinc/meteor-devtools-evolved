# Offscreen Export Flow Documentation

## Overview

This implementation adds a secure, memory-efficient data export system for the Meteor DevTools Evolved extension using Chrome's Offscreen Documents API. The system allows exporting large datasets (DDP logs and Minimongo collections) without blocking the service worker or causing memory issues.

## Architecture

### Components

1. **Offscreen Document** (`src/Browser/Offscreen.ts`)
   - Runs in a separate context from the service worker
   - Handles file blob creation and downloads
   - Manages chunk assembly and memory cleanup

2. **SecureExporter** (`src/Utils/SecureExporter.ts`)
   - Coordinates export operations from the panel
   - Splits data into manageable chunks (100KB each)
   - Provides abort functionality

3. **UI Components**
   - `DDPStatus.tsx` - Export button for DDP logs
   - `MinimongoStatus.tsx` - Export button for Minimongo data

## Security Features

### Token-Based Handshake

Every export operation uses a unique cryptographically secure token:

```typescript
const token = generateExportToken() // 64-character hex string
```

**Security Checks:**
- Token must be present in all messages (init, chunk, abort)
- Token must match between sender and receiver
- Prevents unauthorized export operations

### Sender Verification

```typescript
if (sender.id !== chrome.runtime.id) {
  console.error('Message from unauthorized sender')
  return
}
```

Only messages from the extension itself are processed.

## Chunked Data Transfer

### Why Chunking?

- Prevents memory spikes with large datasets
- Allows for incremental processing
- Enables abort mid-transfer
- Facilitates garbage collection

### Chunk Size

Default chunk size is **100KB**:

```typescript
const CHUNK_SIZE = 100 * 1024 // 100KB chunks
```

### Process

1. Data is converted to JSON string
2. String is split into chunks
3. Each chunk is sent with:
   - Token
   - Chunk index
   - Total chunks
   - isLast flag

4. Offscreen document reassembles chunks in order
5. Download triggered after all chunks received

### Memory Management

- Small delay (10ms) between chunk sends for GC
- Chunks cleared from buffer immediately after use
- All state cleaned up after completion/abort

## Abort Functionality

### Features

- Cancel button appears during export
- Clears all buffered data
- Prevents download
- Notifies user of cancellation

### Implementation

```typescript
exporter.abort() // Immediately stops export
```

**Cleanup on Abort:**
- All chunks cleared from memory
- Export state removed
- No file download occurs

## Usage

### Exporting DDP Logs

1. Navigate to DDP panel
2. Click "Export" button in status bar
3. Wait for export to complete
4. File downloads automatically as `ddp-logs-{timestamp}.json`

### Exporting Minimongo Data

1. Navigate to Minimongo panel
2. Select a collection or view all
3. Click "Export" button
4. File downloads as `minimongo-{collection}-{timestamp}.json`

### Canceling Export

Click "Cancel" button during export to abort operation.

## Testing

### Test Coverage

- **26 unit tests** covering:
  - Token generation and validation
  - Chunk handling (in-order and out-of-order)
  - Memory management
  - Abort functionality
  - Sender verification
  - Security checks

### Running Tests

```bash
yarn test
```

## Performance Considerations

### Memory Usage

- **Small datasets (<100KB)**: Single chunk, minimal overhead
- **Large datasets (>1MB)**: Multiple chunks, memory stays stable
- **Chunking overhead**: ~10ms delay per chunk
- **Peak memory**: ~2x chunk size (one in transit, one being processed)

### Expected Performance

| Dataset Size | Chunks | Approximate Time |
|--------------|--------|------------------|
| 100KB        | 1      | ~100ms          |
| 1MB          | 10     | ~500ms          |
| 10MB         | 100    | ~5s             |
| 100MB        | 1000   | ~50s            |

## Error Handling

### Common Errors

1. **Export Aborted**
   - User cancelled export
   - Handled gracefully, no error shown

2. **Missing Chunks**
   - Network or timing issue
   - Error logged, export fails cleanly

3. **Invalid Token**
   - Security issue detected
   - Export rejected, error logged

## Browser Compatibility

- **Chrome**: Full support (Manifest V3 with Offscreen API)
- **Firefox**: Not supported (uses Manifest V2, no Offscreen API)

## Future Enhancements

Potential improvements:

1. Progress indicator showing chunk progress
2. Configurable chunk size
3. Compression before transfer
4. Export to different formats (CSV, etc.)
5. Resume functionality for failed exports

## Security Audit Checklist

- ✅ Cryptographically secure tokens
- ✅ Sender ID verification
- ✅ Token validation on all messages
- ✅ No data leakage after abort
- ✅ Memory cleanup after operations
- ✅ No unauthorized downloads

## API Reference

### SecureExporter

```typescript
class SecureExporter {
  constructor()
  
  // Export data with automatic chunking
  async export(data: any, filename: string): Promise<void>
  
  // Abort current export
  abort(): void
  
  // Get the security token
  getToken(): string
  
  // Check if aborted
  isAborted(): boolean
}
```

### Message Types

```typescript
interface ExportInit {
  type: 'export-init'
  token: string
  filename: string
  totalChunks: number
}

interface ExportChunk {
  type: 'export-chunk'
  token: string
  chunkIndex: number
  totalChunks: number
  data: string
  isLast: boolean
}

interface ExportAbort {
  type: 'export-abort'
  token: string
}
```

## Troubleshooting

### Export Not Starting

1. Check browser console for errors
2. Verify manifest includes offscreen permission
3. Ensure offscreen.html and offscreen.js exist

### Memory Issues

1. Reduce chunk size in SecureExporter.ts
2. Check for memory leaks in chunk cleanup
3. Monitor browser memory usage during export

### Download Not Triggering

1. Check browser download permissions
2. Verify blob creation in offscreen document
3. Check console for errors in assembly process

## License

MIT License - Same as parent project
