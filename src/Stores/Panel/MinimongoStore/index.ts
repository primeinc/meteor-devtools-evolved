import debounce from 'lodash.debounce'
import { action, computed, flow, makeObservable, observable, runInAction, toJS } from 'mobx'
import { CollectionStore } from './CollectionStore'
import { JSONUtils } from '@/Utils/JSONUtils'
import { StringUtils } from '@/Utils/StringUtils'
import prettyBytes from 'pretty-bytes'
import { mapValues } from '@/Utils/Objects'
import { BridgeAdapter } from '@/Utils/BridgeAdapter'
import { ExportService } from '@/Pages/Panel/Minimongo/services/ExportService'

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
  setCollections(collections: RawCollections) {
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
   * Export active collection with deterministic data refresh
   */
  exportActiveCollection = flow(function* (
    this: MinimongoStore,
    exportType: 'data' | 'schema',
    signal: AbortSignal,
  ) {
    if (!this.activeCollection) return

    this.isExportBusy = true
    this.exportStatus = { progress: 0, message: 'Requesting fresh data…' }

    const reqId = `exp-${this.exportSeq++}`

    // Wait for fresh data with deterministic requestId
    const waitForFresh = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        resolve() // Allow stale-path; UI will show message below
      }, 5000)

      const onReply = (payload: any) => {
        if (!payload || payload.requestId !== reqId) return
        cleanup()
        resolve()
      }

      const cleanup = () => {
        clearTimeout(timeout)
        BridgeAdapter.off('minimongo-get-collections', onReply)
      }

      BridgeAdapter.on('minimongo-get-collections', onReply)
      BridgeAdapter.post('minimongo-get-collections', { requestId: reqId })
    })

    yield waitForFresh

    if (signal.aborted) {
      this.isExportBusy = false
      this.exportStatus = { progress: 1, message: 'Canceled' }
      return
    }

    // Snapshot and unwrap documents
    const wrappers = toJS(this.activeCollectionDocuments.filtered)
    const documents = wrappers.map((w: any) => w.document)

    if (!documents?.length) {
      this.isExportBusy = false
      this.exportStatus = { progress: 1, message: 'Collection is empty' }
      return
    }

    const onProgress = (p: number, m: string) => {
      if (signal.aborted) return
      runInAction(() => {
        this.exportStatus = { progress: p, message: m }
      })
    }

    try {
      if (exportType === 'data') {
        yield ExportService.exportData(
          this.activeCollection,
          documents,
          onProgress,
          signal,
        )
      } else {
        yield ExportService.exportSchema(
          this.activeCollection,
          documents,
          onProgress,
          signal,
        )
      }
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

    console.log({ collectionName })

    return {
      collectionName,
      document,
      _string,
      _size: StringUtils.getSize(_string),
    }
  }
}
