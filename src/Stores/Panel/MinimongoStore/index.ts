import debounce from 'lodash.debounce'
import { action, computed, flow, makeObservable, observable, runInAction, toJS } from 'mobx'
import { CollectionStore } from './CollectionStore'
import { JSONUtils } from '@/Utils/JSONUtils'
import { StringUtils } from '@/Utils/StringUtils'
import prettyBytes from 'pretty-bytes'
import { mapValues } from '@/Utils/Objects'
import { BridgeAdapter } from '@/Utils/BridgeAdapter'
import { ExportService } from '@/Pages/Panel/Minimongo/services/ExportService'
import { createLogger } from '@/Utils/Logger'

const logger = createLogger('MinimongoStore')

export class MinimongoStore {
  activeCollectionDocuments = new CollectionStore()

  @observable collections: MinimongoCollections = {}
  @observable collectionMetadata: ICollectionMetadata = {}
  @observable activeCollection: string | null = null
  @observable search: string = ''
  @observable collectionColorMap: Record<string, string> = {}
  @observable isNavigatorVisible = false

  // Export feature state
  @observable isExportDialogOpen = false
  @observable isExportBusy = false
  @observable exportStatus = { progress: 0, message: '' }
  private exportSeq = 1

  constructor() {
    makeObservable(this)
  }

  @computed
  get totalDocuments() {
    return Object.values(this.collections).reduce(
      (acc, cur) => acc + cur.length,
      0,
    )
  }

  @computed
  get collectionNames() {
    return Object.keys(this.collections).sort()
  }

  @computed
  get filteredCollectionNames() {
    return this.collectionNames.filter(
      name =>
        !this.search || name.toLowerCase().includes(this.search.toLowerCase()),
    )
  }

  @computed
  get totalSize() {
    return Object.entries(this.collectionMetadata).reduce(
      (sum, [collectionName, metadata]) => sum + metadata.collectionSize,
      0,
    )
  }

  @action
  getMetadata(collectionName: string) {
    return this.collectionMetadata?.[collectionName]
  }

  @action
  computeCollectionSizes() {
    Object.keys(this.collections).forEach(collectionName => {
      const collectionSize = this.collections[collectionName].reduce(
        (acc: number, cur: IDocumentWrapper) => acc + cur._size,
        0,
      )

      this.collectionMetadata[collectionName] = {
        collectionSize,
        collectionSizePretty: prettyBytes(collectionSize),
      }
    })
  }

  @action
  syncDocuments() {
    if (this.activeCollection) {
      return this.activeCollectionDocuments.setCollection(
        this.collections[this.activeCollection],
      )
    }

    this.activeCollectionDocuments.setCollection(
      Object.entries(this.collections).flatMap(
        ([collectionName, documents]) => {
          return documents
        },
      ),
    )
  }

  @action
  setCollections(data: RawCollections | any) {
    // Filter out metadata fields (requestId, etc.) that may be echoed from requests
    const { requestId, ...collections } = data

    this.collections = mapValues(collections, (collection, collectionName) => {
      return collection.map(document =>
        MinimongoStore.wrapDocument(document, collectionName),
      )
    })

    this.computeCollectionSizes()

    this.syncDocuments()
  }

  @action
  setActiveCollection(collection: string | null) {
    this.activeCollection = collection

    this.syncDocuments()
  }

  setSearch = debounce(
    action((search: string) => (this.search = search)),
    250,
  )

  @action
  setNavigatorVisible(isVisible: boolean) {
    this.isNavigatorVisible = isVisible
  }

  @action
  toggleExportDialog(isOpen: boolean) {
    this.isExportDialogOpen = isOpen
    if (!isOpen) {
      this.exportStatus = { progress: 0, message: '' }
    }
  }

  /**
   * Export active collection (or all collections if none selected) with optional data refresh
   *
   * @param exportType - Export format key. Supported formats:
   *   - Data formats: 'mongo-import-ndjson', 'mongo-import-array', 'mongo-compass', 'mongo-shell', 'csv'
   *   - Schema formats: 'typescript', 'mongoose', 'json-schema'
   *   - Legacy: 'data' (alias for mongo-import-array), 'schema' (alias for json-schema)
   * @param signal - AbortSignal to cancel the export operation
   * @param refreshData - Whether to refresh data from the page before exporting (default: true)
   */
  exportActiveCollection = flow(function* (
    this: MinimongoStore,
    exportType: string,
    signal: AbortSignal,
    refreshData: boolean = true,
  ) {
    // Allow export when no collection selected (exports all collections)
    if (!this.activeCollection && !this.collectionNames.length) return

    this.isExportBusy = true
    const isExportingAll = !this.activeCollection
    logger.info('Export starting with refreshData:', refreshData, 'isExportingAll:', isExportingAll)

    if (refreshData) {
      const reqId = `exp-${this.exportSeq++}`
      logger.debug('Requesting fresh data with reqId:', reqId)

      // Wait for fresh data with deterministic requestId and visual progress
      const REFRESH_TIMEOUT = 5000
      const PROGRESS_INTERVAL = 100
      let elapsed = 0

      const waitForFresh = new Promise<void>((resolve, reject) => {
        const progressTimer = setInterval(() => {
          elapsed += PROGRESS_INTERVAL
          const progress = Math.min(1.0, elapsed / REFRESH_TIMEOUT)
          const remaining = Math.ceil((REFRESH_TIMEOUT - elapsed) / 1000)
          runInAction(() => {
            this.exportStatus = {
              progress,
              message: `→ BridgeAdapter.post('minimongo-get-collections', {requestId: '${reqId}'}) · Waiting for reply… (${remaining}s)`
            }
          })
        }, PROGRESS_INTERVAL)

        const timeout = setTimeout(() => {
          cleanup()
          runInAction(() => {
            this.exportStatus = { progress: 0, message: `Timeout: No reply after 5s · Using cached data` }
          })
          resolve()
        }, REFRESH_TIMEOUT)

        const onReply = (payload: any) => {
          if (!payload || payload.requestId !== reqId) return
          cleanup()
          runInAction(() => {
            this.exportStatus = { progress: 0, message: `Received: minimongo-get-collections reply · Using fresh data` }
          })
          resolve()
        }

        const cleanup = () => {
          clearTimeout(timeout)
          clearInterval(progressTimer)
          BridgeAdapter.off('minimongo-get-collections', onReply)
        }

        BridgeAdapter.on('minimongo-get-collections', onReply)
        BridgeAdapter.post('minimongo-get-collections', { requestId: reqId })

        // Initialize progress
        runInAction(() => {
          this.exportStatus = { progress: 0, message: `Sent: minimongo-get-collections (reqId: ${reqId}) · Waiting… (5s)` }
        })
      })

      yield waitForFresh
    } else {
      logger.info('Skipping refresh, using cached data')
      this.exportStatus = { progress: 0, message: 'Preparing export…' }
    }

    if (signal.aborted) {
      this.isExportBusy = false
      this.exportStatus = { progress: 1, message: 'Canceled' }
      return
    }

    // Snapshot and unwrap documents
    let documents: any[]
    let collectionName: string

    if (this.activeCollection) {
      // Single collection export
      const wrappers = toJS(this.activeCollectionDocuments.filtered)
      documents = wrappers.map((w: any) => w.document)
      collectionName = this.activeCollection
    } else {
      // All collections export - include _collection field to identify source
      const allDocs: any[] = []
      Object.entries(toJS(this.collections)).forEach(([name, wrappers]: [string, any[]]) => {
        wrappers.forEach((w: any) => {
          allDocs.push({ _collection: name, ...w.document })
        })
      })
      documents = allDocs
      collectionName = 'all-collections'
    }

    if (!documents?.length) {
      this.isExportBusy = false
      this.exportStatus = { progress: 1, message: isExportingAll ? 'No collections to export' : 'Collection is empty' }
      return
    }

    const onProgress = (p: number, m: string) => {
      if (signal.aborted) return
      runInAction(() => {
        this.exportStatus = { progress: p, message: m }
      })
    }

    try {
      // Map legacy format keys to new system
      let actualFormatKey = exportType
      if (exportType === 'data') actualFormatKey = 'mongo-import-array'
      if (exportType === 'schema') actualFormatKey = 'json-schema'

      const format = ExportService.getFormats().find(f => f.key === actualFormatKey)
      if (!format) throw new Error(`Unknown export format: ${exportType}`)

      yield ExportService.exportCollection(format, collectionName, documents, onProgress, signal, { pretty: true })
      runInAction(() => {
        this.exportStatus = { progress: 1, message: 'Download complete' }
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        runInAction(() => {
          this.exportStatus = { progress: 1, message: 'Canceled' }
        })
      } else {
        runInAction(() => {
          this.exportStatus = {
            progress: 1,
            message: `Error: ${e?.message || e}`,
          }
        })
      }
    } finally {
      runInAction(() => {
        this.isExportBusy = false
      })
    }
  })

  static wrapDocument(
    document: IDocument,
    collectionName: string,
  ): IDocumentWrapper {
    const _string = JSONUtils.stringify(document)

    return {
      collectionName,
      document,
      _string,
      _size: StringUtils.getSize(_string),
    }
  }
}
