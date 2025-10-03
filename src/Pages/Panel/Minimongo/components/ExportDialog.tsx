import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import {
  Dialog,
  Button,
  RadioGroup,
  Radio,
  ProgressBar,
  Callout,
  Classes,
  TextArea,
  Intent,
  Checkbox,
} from '@blueprintjs/core'
import { runInAction } from 'mobx'
import { usePanelStore } from '@/Stores/PanelStore'

export interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export const ExportDialog = observer(function ExportDialog(
  props: ExportDialogProps,
) {
  const { minimongoStore } = usePanelStore()
  const [mode, setMode] = useState<'data' | 'schema'>('data')
  const [refreshData, setRefreshData] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState('')
  const [previewSize, setPreviewSize] = useState(0)
  const [isFullPreview, setIsFullPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const generatePreview = async () => {
    if (!minimongoStore.activeCollection) return

    // Use the same data source as export function
    const wrappers = minimongoStore.activeCollectionDocuments?.filtered || []
    const docs = wrappers.map((w: any) => w.document)
    if (docs.length === 0) {
      setPreviewData('[]')
      setPreviewSize(2)
      setShowPreview(true)
      return
    }

    let data = ''
    if (mode === 'data') {
      // Show documents up to 1MB preview limit
      const MAX_PREVIEW = 1024 * 1024 // 1MB
      const previewDocs = []
      let previewText = '[\n'

      for (let i = 0; i < docs.length; i++) {
        const docJson = JSON.stringify(docs[i], null, 2)
        const separator = i === 0 ? '' : ',\n'
        const testText = previewText + separator + docJson

        if (testText.length + 2 > MAX_PREVIEW) break // +2 for closing ]\n

        previewDocs.push(docs[i])
        previewText = testText
      }

      previewText += '\n]'
      data = previewText

      const isFull = previewDocs.length === docs.length
      setIsFullPreview(isFull)

      if (!isFull) {
        data += `\n\n... and ${docs.length - previewDocs.length} more documents (preview limited to 1MB)\n`
      }
    } else {
      setIsFullPreview(false) // Schema is always a summary
      // Show schema structure
      const sample = docs.slice(0, 10).map(d => Object.keys(d))
      const uniqueKeys = [...new Set(sample.flat())].sort()
      data = 'Schema preview:\n'
      data += 'Fields found:\n'
      uniqueKeys.forEach(k => {
        data += `  - ${k}\n`
      })
      data += `\nAnalyzing ${docs.length} documents...`
    }

    // Calculate actual size — sample-based estimate
    const sample = docs.slice(0, 200).map(d => JSON.stringify(d))
    const avg = sample.length ? sample.reduce((a, s) => a + s.length, 0) / sample.length : 0
    const bytes = Math.round(avg * docs.length)
    const mb = Math.round(bytes / 1024 / 1024)

    // Warn if export is likely to fail (>250MB)
    if (mb > 250) {
      data += `\n\n⚠️ WARNING: Export size (~${mb} MB) exceeds recommended limit (250 MB).\nLarge exports may fail silently or freeze the browser.`
    }

    setPreviewData(data)
    setPreviewSize(bytes)
    setShowPreview(true)
  }

  useEffect(() => {
    if (props.isOpen) {
      // Clear any previous export status
      runInAction(() => {
        minimongoStore.exportStatus = { progress: 0, message: '' }
      })
      generatePreview()
    }
  }, [props.isOpen, mode, minimongoStore])

  const start = async () => {
    abortRef.current = new AbortController()
    await minimongoStore.exportActiveCollection(mode, abortRef.current.signal, refreshData)
  }

  const cancel = () => {
    abortRef.current?.abort()
    runInAction(() => {
      minimongoStore.exportStatus.message = 'Canceled'
    })
  }

  return (
    <Dialog
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Export collection"
      portalClassName="export-dialog-portal"
    >
      <style>{`.export-dialog-portal { z-index: 999999; }`}</style>
      <div className={Classes.DIALOG_BODY}>
        <RadioGroup
          selectedValue={mode}
          onChange={e => setMode((e.target as HTMLInputElement).value as any)}
        >
          <Radio label="Collection Data (JSON)" value="data" />
          <Radio label="Inferred Schema (JSON Schema)" value="schema" />
        </RadioGroup>

        <Checkbox
          checked={refreshData}
          onChange={e => setRefreshData((e.target as HTMLInputElement).checked)}
          label="Refresh data from page before export"
          style={{ marginTop: 12 }}
        />

        <Callout icon="info-sign" intent="primary" style={{ marginTop: 16 }}>
          Note: Data types are inferred from the devtools sanitized snapshot.
          Complex types like Dates may be stringified.
        </Callout>

        {showPreview && !minimongoStore.isExportBusy && !minimongoStore.exportStatus.message && (
          <div style={{ marginTop: 16 }}>
            <h4>Preview (Size: {(previewSize / 1024).toFixed(1)} KB)</h4>
            <TextArea
              value={previewData}
              readOnly
              style={{
                width: '100%',
                height: '200px',
                fontFamily: 'monospace',
                fontSize: '11px',
                marginTop: 8
              }}
            />
            <Callout intent={mode === 'schema' ? Intent.PRIMARY : (isFullPreview ? Intent.SUCCESS : Intent.WARNING)} style={{ marginTop: 8 }}>
              {mode === 'schema'
                ? `Schema inferred from ${minimongoStore.activeCollectionDocuments?.filtered?.length || 0} documents`
                : isFullPreview
                  ? `Full preview shown. Export size: ${(previewSize / 1024).toFixed(1)} KB`
                  : `Preview truncated at 1MB. Full export size: ${(previewSize / 1024).toFixed(1)} KB`
              }
            </Callout>
          </div>
        )}

        {(minimongoStore.isExportBusy || minimongoStore.exportStatus.message) && (
          <>
            <div style={{ marginTop: 16 }}>
              <ProgressBar
                value={minimongoStore.exportStatus.progress}
                animate={minimongoStore.isExportBusy}
                stripes={minimongoStore.isExportBusy}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#8A9BA8' }}>
              {minimongoStore.exportStatus.message}
            </div>
          </>
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button
            onClick={props.onClose}
            disabled={minimongoStore.isExportBusy}
          >
            Close
          </Button>
          {!minimongoStore.isExportBusy ? (
            <Button
              intent="primary"
              onClick={start}
              disabled={!minimongoStore.activeCollection}
            >
              Download
            </Button>
          ) : (
            <Button intent="warning" onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
})
