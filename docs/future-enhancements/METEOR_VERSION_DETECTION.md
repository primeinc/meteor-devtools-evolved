# Meteor Version Detection (Future Enhancement)

**Status:** Proposed (Not Implemented)
**Created:** 2025-10-05
**Priority:** Low
**Estimated Effort:** 4-6 hours

## Executive Summary

Add runtime detection of Meteor version to enable version-specific behavior, UI display, and feature gating. This enhancement was proposed during EJSON export format implementation but deferred until concrete use cases emerge.

## Why Deferred?

✅ **Reasons to defer:**
- No current version-specific export logic exists
- EJSON format is identical across Meteor 1.x/2.x/3.x
- All export formats work without version detection
- Better to add when we have concrete requirement
- Avoids premature optimization

❌ **No immediate use case:**
```javascript
// This is identical for all Meteor versions:
if (meteorVersion >= 3) {
  return docs.map(doc => EJSON.stringify(doc)).join('\n');
}
// Meteor 2
return docs.map(doc => EJSON.stringify(doc)).join('\n');
```

## Use Cases (When to Implement)

### 1. UI Display
Show Meteor version in DevTools header:
```
┌─────────────────────────────────────┐
│ Meteor DevTools  [Meteor 2.13.3]    │
└─────────────────────────────────────┘
```

**Trigger:** User requests "show Meteor version in UI"

### 2. Feature Gating
Enable/disable features based on version:
```typescript
if (meteorInfoStore.isMeteor3) {
  // Show Meteor 3+ only features
  showAsyncFeatures();
}

if (meteorInfoStore.majorVersion < 2.8) {
  // Disable Shield Billing for old versions
  disableShieldBilling("Requires Meteor 2.8+");
}
```

**Trigger:** Feature only works in specific Meteor versions

### 3. Export Format Adaptation
Adjust export logic if Meteor 3+ changes EJSON:
```typescript
if (meteorVersion >= 3) {
  // Hypothetical: Meteor 3 adds new EJSON types
  return docs.map(doc => EJSON.stringify(doc, { meteor3: true })).join('\n');
}
```

**Trigger:** Meteor 3.0 breaks EJSON compatibility

### 4. Telemetry/Analytics
Track which Meteor versions users debug:
```typescript
analytics.track('devtools_opened', {
  meteor_version: meteorInfoStore.version,
  meteor_major: meteorInfoStore.majorVersion,
  is_production: meteorInfoStore.isProduction,
});
```

**Trigger:** Product team wants version distribution data

## Implementation Plan

### Step 1: Detect and Capture Meteor Version

**File:** `src/Browser/Inject.ts`

```typescript
/**
 * Detect Meteor version and environment info
 *
 * Captures:
 * - Meteor.release: "METEOR@2.13.3" or "METEOR@3.0.0"
 * - Environment flags: isProduction, isCordova, etc.
 *
 * @returns Meteor info object or null if not a Meteor app
 */
export function detectMeteorInfo() {
  if (typeof Meteor === 'undefined') return null;

  const release = Meteor.release || 'UNKNOWN';
  const version = release.split('@')[1] || 'UNKNOWN';
  const versionParts = version.split('.');

  return {
    release,                                    // "METEOR@2.13.3"
    version,                                    // "2.13.3"
    majorVersion: parseInt(versionParts[0]) || 0,  // 2
    minorVersion: parseInt(versionParts[1]) || 0,  // 13
    patchVersion: parseInt(versionParts[2]) || 0,  // 3
    isProduction: Meteor.isProduction || false,
    isCordova: Meteor.isCordova || false,
    isClient: Meteor.isClient || false,
    isServer: false,  // Always false in browser context
  };
}

// Modify inject() function
function inject() {
  --attempts

  if (typeof Meteor === 'object' && !window.__meteor_devtools_evolved) {
    window.__meteor_devtools_evolved = true

    // 1. Capture Meteor version FIRST (before other injectors)
    const meteorInfo = detectMeteorInfo();

    // 2. Send to devtools panel
    if (meteorInfo) {
      sendMessage('meteor-info', meteorInfo);
    }

    // 3. Continue with other injectors
    DDPInjector()
    MinimongoInjector()
    MeteorAdapter()

    return
  }

  // ... rest of code
}
```

**Rationale:**
- Detect version BEFORE other injectors run
- Send immediately so store is populated early
- Graceful degradation if Meteor.release unavailable

### Step 2: Create MobX Store

**File:** `src/Stores/Panel/MeteorInfoStore.ts` (NEW)

```typescript
import { makeObservable, observable, action } from 'mobx';

export interface IMeteorInfo {
  release: string;        // "METEOR@2.13.3"
  version: string;        // "2.13.3"
  majorVersion: number;   // 2
  minorVersion: number;   // 13
  patchVersion: number;   // 3
  isProduction: boolean;
  isCordova: boolean;
  isClient: boolean;
  isServer: boolean;
}

export class MeteorInfoStore {
  @observable meteorInfo: IMeteorInfo | null = null;

  constructor() {
    makeObservable(this);
  }

  @action
  setMeteorInfo(info: IMeteorInfo) {
    this.meteorInfo = info;
  }

  // Convenience getters
  get version(): string {
    return this.meteorInfo?.version || 'UNKNOWN';
  }

  get majorVersion(): number {
    return this.meteorInfo?.majorVersion || 0;
  }

  get isMeteor3(): boolean {
    return this.majorVersion >= 3;
  }

  get isMeteor2(): boolean {
    return this.majorVersion === 2;
  }

  get isMeteor1(): boolean {
    return this.majorVersion === 1;
  }

  get displayName(): string {
    if (!this.meteorInfo) return 'Unknown';

    const env = this.meteorInfo.isProduction ? ' (Production)' : '';
    const cordova = this.meteorInfo.isCordova ? ' [Cordova]' : '';

    return `Meteor ${this.version}${env}${cordova}`;
  }

  /**
   * Check if version meets minimum requirement
   * @example isAtLeast(2, 8) // true if Meteor 2.8+
   */
  isAtLeast(major: number, minor: number = 0): boolean {
    if (!this.meteorInfo) return false;

    if (this.meteorInfo.majorVersion > major) return true;
    if (this.meteorInfo.majorVersion < major) return false;

    return this.meteorInfo.minorVersion >= minor;
  }
}
```

**Rationale:**
- Centralized version info
- Type-safe access
- Convenience methods for common checks
- Observable for reactive UI updates

### Step 3: Wire Up to PanelStore

**File:** `src/Stores/PanelStore.tsx`

```typescript
import { MeteorInfoStore } from './Panel/MeteorInfoStore';

export class PanelStore {
  // ... existing stores
  ddpStore = new DDPStore()
  minimongoStore = new MinimongoStore()
  meteorInfoStore = new MeteorInfoStore()  // ADD THIS

  // ... rest of code
}
```

### Step 4: Handle meteor-info Message

**File:** `src/Bridge.ts` (or wherever messages are handled)

```typescript
import { Registry } from '@/Browser/Inject'
import { getPanelStore } from '@/Stores/PanelStore'

// Add handler for meteor-info message
Registry.register('meteor-info', (message: Message<IMeteorInfo>) => {
  const panelStore = getPanelStore();
  panelStore.meteorInfoStore.setMeteorInfo(message.data);
});
```

### Step 5: Display in UI (Optional)

**File:** `src/Pages/Panel/Header.tsx`

```tsx
import { usePanelStore } from '@/Stores/PanelStore';
import { observer } from 'mobx-react-lite';

export const PanelHeader = observer(() => {
  const { meteorInfoStore } = usePanelStore();

  return (
    <div className="panel-header">
      <span className="app-title">Meteor DevTools Evolved</span>

      {meteorInfoStore.meteorInfo && (
        <Tag minimal intent={meteorInfoStore.meteorInfo.isProduction ? 'danger' : 'success'}>
          {meteorInfoStore.displayName}
        </Tag>
      )}
    </div>
  );
});
```

### Step 6: Use in Export Formats (Example)

**File:** `src/Pages/Panel/Minimongo/services/MongoExportFormats.ts`

```typescript
import { getPanelStore } from '@/Stores/PanelStore';

/**
 * Get Meteor major version for conditional logic
 * Falls back to 2 if unavailable (safe default)
 */
function getMeteorMajorVersion(): number {
  const panelStore = getPanelStore();
  return panelStore.meteorInfoStore.majorVersion || 2;
}

/**
 * Example: Adapt export based on Meteor version (if needed)
 */
export const MONGO_IMPORT_NDJSON: ExportFormat = {
  key: 'mongo-import-ndjson',
  name: 'MongoDB Import (NDJSON)',
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || [];
    if (docs.length === 0) return '';

    const meteorVersion = getMeteorMajorVersion();

    // Hypothetical: Meteor 3 adds new EJSON option
    if (meteorVersion >= 3) {
      return docs.map(doc => EJSON.stringify(doc, { useNewTypes: true })).join('\n');
    }

    // Standard EJSON for Meteor 1 & 2
    return docs.map(doc => EJSON.stringify(doc)).join('\n');
  }
};
```

## Alternative: Lightweight Window Global

If you don't need reactive UI or centralized store:

**File:** `src/Browser/Inject.ts`

```typescript
// Declare global type
declare global {
  interface Window {
    __meteor_info?: {
      release: string;
      version: string;
      majorVersion: number;
    }
  }
}

function inject() {
  if (typeof Meteor === 'object' && !window.__meteor_devtools_evolved) {
    window.__meteor_devtools_evolved = true;

    // Store on window for quick access
    window.__meteor_info = {
      release: Meteor.release || 'UNKNOWN',
      version: Meteor.release?.split('@')[1] || 'UNKNOWN',
      majorVersion: parseInt((Meteor.release?.split('@')[1] || '2').split('.')[0]),
    };

    // Still send to devtools
    sendMessage('meteor-info', window.__meteor_info);

    // ... rest
  }
}
```

**Usage:**
```typescript
function getMeteorMajorVersion(): number {
  return window.__meteor_info?.majorVersion || 2;
}
```

**Pros:**
- Simple, no store needed
- Immediate access
- Low overhead

**Cons:**
- Pollutes global scope
- Not reactive for UI
- Harder to mock in tests

## Implementation Risks & Mitigations

### Risk 1: Timing Issues

**Problem:** Meteor.release might not be defined when injector runs

**Mitigation:**
```typescript
export function detectMeteorInfo() {
  if (typeof Meteor === 'undefined') {
    console.warn('[MDE] Meteor not found - not a Meteor app?');
    return null;
  }

  if (!Meteor.release) {
    console.warn('[MDE] Meteor.release undefined - old Meteor version?');
    return {
      release: 'UNKNOWN',
      version: 'UNKNOWN',
      majorVersion: 1,  // Assume old version
      // ... rest
    };
  }

  // ... normal detection
}
```

### Risk 2: Parsing Failures

**Problem:** Non-standard Meteor.release format

**Mitigation:**
```typescript
function parseVersion(release: string): { major: number; minor: number; patch: number } {
  try {
    const version = release.split('@')[1];
    if (!version) throw new Error('No @ separator');

    const parts = version.split('.');

    return {
      major: parseInt(parts[0]) || 0,
      minor: parseInt(parts[1]) || 0,
      patch: parseInt(parts[2]) || 0,
    };
  } catch (e) {
    console.error('[MDE] Failed to parse Meteor version:', release, e);
    return { major: 0, minor: 0, patch: 0 };
  }
}
```

### Risk 3: Race Conditions

**Problem:** Version message arrives after user clicks export

**Mitigation:**
```typescript
// In export code
function getMeteorMajorVersion(): number {
  const store = getPanelStore();

  // Wait briefly if info not loaded yet
  if (!store.meteorInfoStore.meteorInfo) {
    console.warn('[MDE] Meteor version not detected yet, using safe default');
    return 2;  // Safe default
  }

  return store.meteorInfoStore.majorVersion;
}
```

## Testing Strategy

### Unit Tests

**File:** `src/Stores/Panel/MeteorInfoStore.spec.ts`

```typescript
describe('MeteorInfoStore', () => {
  it('should parse Meteor 2.13.3', () => {
    const store = new MeteorInfoStore();
    store.setMeteorInfo({
      release: 'METEOR@2.13.3',
      version: '2.13.3',
      majorVersion: 2,
      minorVersion: 13,
      patchVersion: 3,
      isProduction: false,
      isCordova: false,
      isClient: true,
      isServer: false,
    });

    expect(store.version).toBe('2.13.3');
    expect(store.isMeteor2).toBe(true);
    expect(store.isMeteor3).toBe(false);
    expect(store.isAtLeast(2, 13)).toBe(true);
    expect(store.isAtLeast(2, 14)).toBe(false);
  });

  it('should handle unknown version', () => {
    const store = new MeteorInfoStore();

    expect(store.version).toBe('UNKNOWN');
    expect(store.majorVersion).toBe(0);
    expect(store.displayName).toBe('Unknown');
  });
});
```

### Integration Tests

Test with different Meteor versions in browser context:
- Meteor 1.12 (legacy)
- Meteor 2.13 (current stable)
- Meteor 3.0 (future)

## Documentation Updates Needed

When implementing:

1. **README.md**: Add "Meteor Version Detection" to features list
2. **User Guide**: Document version display in UI
3. **API Docs**: Document `meteorInfoStore` methods
4. **Changelog**: Note version detection added

## Migration Path

This is a net-new feature with no breaking changes:

1. Deploy code with version detection
2. Existing functionality unaffected
3. New features can leverage version info
4. No user action required

## Success Metrics

When to consider this successful:

- [ ] Version displays correctly in UI
- [ ] Store properly populated on devtools open
- [ ] Feature gating works (if/when needed)
- [ ] No performance impact on inject
- [ ] Works with Meteor 1.x, 2.x, 3.x

## Related Issues

- User request for Meteor 3 compatibility (future)
- Shield Billing version requirements
- Analytics/telemetry tracking

## References

- [Meteor.release Documentation](https://docs.meteor.com/api/core.html#Meteor-release)
- [EJSON Compatibility](https://docs.meteor.com/api/ejson.html)
- Original discussion: Export formats EJSON fix (2025-10-05)

## Decision Log

**2025-10-05:** Deferred implementation
- **Reason:** No concrete use case exists yet
- **Revisit when:** User requests version in UI OR Meteor 3 breaks EJSON compatibility
- **Documented here:** For future reference and quick implementation

---

**When you're ready to implement this, all the pieces are here. Just follow the steps and adjust as needed!**
