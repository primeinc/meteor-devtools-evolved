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
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState('')
  const [previewSize, setPreviewSize] = useState(0)
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
      // Show first 3 documents
      const preview = docs.slice(0, 3)
      data = JSON.stringify(preview, null, 2)
      if (docs.length > 3) {
        data += `\n\n... and ${docs.length - 3} more documents\n`
      }
    } else {
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

    // Calculate actual size
    const fullData = JSON.stringify(docs)
    const bytes = new TextEncoder().encode(fullData).length

    setPreviewData(data)
    setPreviewSize(bytes)
    setShowPreview(true)
  }

  const start = async () => {
    setShowPreview(false)
    abortRef.current = new AbortController()
    await minimongoStore.exportActiveCollection(mode, abortRef.current.signal)
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

        <Callout icon="info-sign" intent="primary" style={{ marginTop: 16 }}>
          Note: Data types are inferred from the devtools sanitized snapshot.
          Complex types like Dates may be stringified.
        </Callout>

        {showPreview && (
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
            <Callout intent={Intent.WARNING} style={{ marginTop: 8 }}>
              This preview shows a sample. Full export size: {(previewSize / 1024).toFixed(1)} KB
            </Callout>
          </div>
        )}

        {minimongoStore.isExportBusy && (
          <>
            <div style={{ marginTop: 16 }}>
              <ProgressBar value={minimongoStore.exportStatus.progress} />
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
          {!showPreview && !minimongoStore.isExportBusy && (
            <Button
              onClick={generatePreview}
              disabled={!minimongoStore.activeCollection}
            >
              Preview
            </Button>
          )}
          {showPreview && !minimongoStore.isExportBusy && (
            <>
              <Button onClick={() => setShowPreview(false)}>
                Back
              </Button>
              <Button
                intent="primary"
                onClick={start}
                disabled={!minimongoStore.activeCollection}
              >
                Download
              </Button>
            </>
          )}
          {minimongoStore.isExportBusy && (
            <Button intent="warning" onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
})
