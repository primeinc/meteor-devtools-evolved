# Chrome MV3 Offscreen Document for Downloads

This document explains the implementation of the Chrome Manifest V3 (MV3) offscreen document flow for handling file downloads with proper filename support.

## Overview

In Chrome MV3, service workers cannot directly use the `chrome.downloads` API with blob URLs to create downloads with custom filenames. To work around this limitation, we use an offscreen document that has access to the DOM and can properly handle blob creation and downloads.

## Architecture

### Components

1. **Offscreen Document** (`extension/export.html` + `src/Browser/Export.ts`)
   - Runs in a hidden document context
   - Has DOM access to create blobs
   - Uses `chrome.downloads` API to initiate downloads with proper filenames
   - Listens for download messages from the service worker

2. **Service Worker** (`src/Browser/Background.ts`)
   - Creates and manages the offscreen document
   - Receives download requests from the UI
   - Forwards download data to the offscreen document
   - Does not directly handle blob creation or downloads

3. **Utility Functions** (`src/Utils/DownloadUtils.ts`)
   - Provides convenient functions for triggering downloads from UI components
   - `triggerDownload()` - Generic download function
   - `exportToJSON()` - Export any data as JSON
   - `exportCollectionToJSON()` - Export Minimongo collections
   - `exportDDPLogs()` - Export DDP logs

### Message Flow

```
UI Component
    ↓ (calls exportToJSON/exportDDPLogs)
DownloadUtils
    ↓ (sends message via browser.runtime.sendMessage)
Service Worker (Background.ts)
    ↓ (forwards to offscreen document)
Offscreen Document (Export.ts)
    ↓ (creates blob and calls chrome.downloads.download)
Browser Download Manager
```

## Permissions

The following permissions are required in `manifest-v3.json`:

- `offscreen` - Allows creation of offscreen documents
- `downloads` - Allows using the chrome.downloads API

## Usage Examples

### Export DDP Logs

```typescript
import { exportDDPLogs } from '@/Utils/DownloadUtils'

const logs = ddpStore.collection
await exportDDPLogs(logs)
```

### Export Minimongo Collection

```typescript
import { exportCollectionToJSON } from '@/Utils/DownloadUtils'

const collectionName = 'users'
const data = usersCollection.find().fetch()
await exportCollectionToJSON(collectionName, data)
```

### Generic Export

```typescript
import { exportToJSON } from '@/Utils/DownloadUtils'

const myData = { foo: 'bar', items: [1, 2, 3] }
await exportToJSON(myData, 'my-export')
// Downloads as "my-export.json"
```

### Custom Download

```typescript
import { triggerDownload } from '@/Utils/DownloadUtils'

const csvData = 'Name,Age\nJohn,30\nJane,25'
await triggerDownload(csvData, 'export.csv', 'text/csv')
```

## Implementation Details

### Offscreen Document Lifecycle

- The offscreen document is created when the service worker starts
- It remains active throughout the extension's lifecycle
- If it's already created, subsequent creation attempts are no-ops
- Chrome automatically manages the offscreen document's lifecycle

### Error Handling

- All download functions include try-catch blocks
- Errors are logged to the console
- UI components should handle errors and show appropriate toast messages

### Browser Compatibility

- This implementation is specific to Chrome MV3
- Firefox MV2 does not require offscreen documents and can download directly
- The code includes appropriate checks to ensure it only runs in Chrome MV3 environments

## Files Modified/Created

### New Files
- `extension/export.html` - Offscreen document HTML
- `src/Browser/Export.ts` - Offscreen document script
- `src/Utils/DownloadUtils.ts` - Download utility functions

### Modified Files
- `extension/manifest-v3.json` - Added `offscreen` and `downloads` permissions
- `src/Browser/Background.ts` - Added offscreen document management
- `webpack/base.js` - Added export entry point
- `src/Pages/Panel/DDP/DDPStatus.tsx` - Added export button
- `src/Pages/Panel/Minimongo/MinimongoStatus.tsx` - Added export button

## Testing

To test the implementation:

1. Build the Chrome extension: `yarn build:chrome`
2. Load the extension in Chrome
3. Open DevTools and navigate to a Meteor app
4. Use the DDP or Minimongo panels
5. Click the export button to download data
6. Verify the downloaded file has the correct name and content

## Future Enhancements

Potential improvements:

- Add export options (e.g., format selection, filtering)
- Support for other file formats (CSV, XML, etc.)
- Batch export capabilities
- Export history/recent downloads
- Progress indication for large exports
