import React, { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import {
  Dialog,
  Button,
  ProgressBar,
  Callout,
  Classes,
  TextArea,
  Intent,
  Checkbox,
  HTMLSelect,
} from '@blueprintjs/core'
import { runInAction } from 'mobx'
import { usePanelStore } from '@/Stores/PanelStore'
import { ExportService } from '../services/ExportService'
import { ExportFormat, flattenObject } from '../services/MongoExportFormats'

export interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

const ALL_FORMATS = ExportService.getFormats()

export const ExportDialog = observer(function ExportDialog(
  props: ExportDialogProps,
) {
  const { minimongoStore } = usePanelStore()
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(ALL_FORMATS[0])
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
    // Gather documents from active collection or all collections
    let docs: any[]
    let collectionName: string

    if (minimongoStore.activeCollection) {
      // Single collection export
      const wrappers = minimongoStore.activeCollectionDocuments?.filtered || []
      docs = wrappers.map((w: any) => w.document)
      collectionName = minimongoStore.activeCollection
    } else {
      // All collections export
      const allDocs: any[] = []
      Object.entries(minimongoStore.collections).forEach(([name, wrappers]: [string, any[]]) => {
        wrappers.forEach((w: any) => {
          allDocs.push({ _collection: name, ...w.document })
        })
      })
      docs = allDocs
      collectionName = 'all-collections'
    }
    if (docs.length === 0) {
      setPreviewData('No documents to export')
      setPreviewSize(0)
      setShowPreview(true)
      return
    }

    // Generate preview using selected format
    const MAX_PREVIEW = 1024 * 1024 // 1MB
    let data = ''
    let fullOutput = '' // Hoist to function scope for size calculation

    // For schema/type generation formats, show summary
    const isSchemaFormat = selectedFormat.category === 'schema'

    if (isSchemaFormat) {
      setIsFullPreview(false)
      // Use flattenObject to show nested fields in dot notation (e.g., user.name, user.age)
      // This gives a more accurate preview than just top-level keys
      const sample = docs.slice(0, 100).map(d => Object.keys(flattenObject(d)))
      const uniqueKeys = [...new Set(sample.flat())].sort()
      data = `${selectedFormat.name} Preview:\n\n`
      data += `Format: ${selectedFormat.description}\n`
      data += `Documents: ${docs.length}\n`
      data += `Fields found: ${uniqueKeys.length}\n\n`
      data += uniqueKeys.map(k => `  • ${k}`).join('\n')
      data += `\n\nFull ${selectedFormat.name} will be generated on export.`
    } else {
      // For data formats, show actual preview
      try {
        const exportData = { documents: docs, collectionName }
        fullOutput = selectedFormat.formatter(exportData, { pretty: true })

        if (fullOutput.length <= MAX_PREVIEW) {
          data = fullOutput
          setIsFullPreview(true)
        } else {
          data = fullOutput.substring(0, MAX_PREVIEW)
          const fullSizeKB = (new Blob([fullOutput]).size / 1024).toFixed(1)
          data += `\n\n... (preview truncated at 1MB, full export is ${fullSizeKB} KB)`
          setIsFullPreview(false)
        }
      } catch (e: any) {
        data = `Preview error: ${e.message}`
        setIsFullPreview(false)
      }
    }

    // Calculate actual size (use real output for data formats, sample for schema formats)
    let bytes: number
    if (isSchemaFormat || !fullOutput) {
      // For schema formats or if generation failed, estimate from sample
      const sample = docs.slice(0, 200).map(d => JSON.stringify(d))
      const avg = sample.length ? sample.reduce((a, s) => a + s.length, 0) / sample.length : 0
      bytes = Math.round(avg * docs.length)
    } else {
      // For data formats, use actual generated output size
      bytes = new Blob([fullOutput]).size
    }
    const mb = Math.round(bytes / 1024 / 1024)

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
  }, [props.isOpen, selectedFormat, minimongoStore])

  const start = async () => {
    abortRef.current = new AbortController()
    await minimongoStore.exportActiveCollection(selectedFormat.key, abortRef.current.signal, refreshData)
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
      title={minimongoStore.activeCollection ? `Export ${minimongoStore.activeCollection}` : "Export All Collections"}
      portalClassName="export-dialog-portal"
    >
      <style>{`.export-dialog-portal { z-index: 999999; }`}</style>
      <div className={Classes.DIALOG_BODY}>
        <div style={{ marginBottom: 16 }}>
          <label className={Classes.LABEL}>
            Export Format
            <HTMLSelect
              value={selectedFormat.key}
              onChange={e => {
                const format = ALL_FORMATS.find(f => f.key === e.target.value)
                if (format) setSelectedFormat(format)
              }}
              fill
            >
              {ALL_FORMATS.map(format => (
                <option key={format.key} value={format.key}>
                  {format.name} — {format.description}
                </option>
              ))}
            </HTMLSelect>
          </label>
        </div>

        <Checkbox
          checked={refreshData}
          onChange={e => setRefreshData((e.target as HTMLInputElement).checked)}
          label="Refresh data from page before export"
          style={{ marginTop: 12 }}
        />

        <Callout icon="info-sign" intent="primary" style={{ marginTop: 16 }}>
          Note: Data types are preserved using EJSON serialization.
          Date, ObjectId, and Binary types are exported with full type information.
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
            <Callout intent={isFullPreview ? Intent.SUCCESS : Intent.PRIMARY} style={{ marginTop: 8 }}>
              {minimongoStore.activeCollection
                ? `${selectedFormat.name}: ${minimongoStore.activeCollectionDocuments?.filtered?.length || 0} documents from "${minimongoStore.activeCollection}"`
                : `${selectedFormat.name}: ${minimongoStore.totalDocuments} documents across ${minimongoStore.collectionNames.length} collections`
              }
              {isFullPreview && ` — Full preview shown (${(previewSize / 1024).toFixed(1)} KB)`}
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
              disabled={!minimongoStore.collectionNames.length}
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
