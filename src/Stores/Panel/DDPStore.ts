import debounce from 'lodash.debounce'
import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import EventEmitter from 'eventemitter3'
import { Searchable } from '../Common/Searchable'
import { PanelStore } from '@/Stores/PanelStore'
import { generatePreview } from '@/Utils/MessageFormatter'
import { clearCache } from '@/Bridge'

class SearchableEventEmitter<T> extends Searchable<T> {
  private emitter = new EventEmitter()

  emit(event: string, ...args: any[]) {
    return this.emitter.emit(event, ...args)
  }

  on(event: string, fn: (...args: any[]) => void) {
    return this.emitter.on(event, fn)
  }

  off(event: string, fn: (...args: any[]) => void) {
    return this.emitter.off(event, fn)
  }

  once(event: string, fn: (...args: any[]) => void) {
    return this.emitter.once(event, fn)
  }

  removeAllListeners(event?: string) {
    return this.emitter.removeAllListeners(event)
  }
}

export class DDPStore extends SearchableEventEmitter<DDPLog> {
  @observable inboundBytes = 0
  @observable outboundBytes = 0
  @observable newLogs: string[] = []

  constructor() {
    super()
    makeObservable(this)
  }

  bufferCallback = (buffer: DDPLog[]) => {
    this.buffer = buffer.map((log: DDPLog) => ({
      ...log,
      preview: generatePreview(
        log.content,
        log.parsedContent as DDPLogContent,
        log.filterType,
      ),
    }))

    this.newLogs.push(...buffer.map(({ id }) => id))

    this.inboundBytes += buffer
      .filter(log => log.isInbound)
      .reduce((sum, log) => sum + (log.byteSize ?? log.size ?? 0), 0)

    this.outboundBytes += buffer
      .filter(log => log.isOutbound)
      .reduce((sum, log) => sum + (log.byteSize ?? log.size ?? 0), 0)

    // Emit events for DDP 'changed' messages (for Workload C)
    buffer.forEach(log => {
      if (log.parsedContent.msg === 'changed') {
        this.emit('ddp-changed', {
          docId: log.parsedContent.id,
          collection: log.parsedContent.collection,
          fields: Object.keys(log.parsedContent.fields || {}),
        })
      }
    })

    this.clearNewLogs()
  }

  clearNewLogs = debounce(() => {
    runInAction(() => {
      this.newLogs = []
    })
  }, 1000)

  filterFunction = (collection: DDPLog[], search: string) =>
    collection
      .filter(log => !this.filterRegularExpression.test(log.content))
      .filter(
        log =>
          !search ||
          log.content
            .toLowerCase()
            .concat(log.preview ?? '')
            .includes(search.toLowerCase()),
      )

  @action
  clearLogs() {
    this.collection = []
    this.inboundBytes = 0
    this.outboundBytes = 0

    clearCache()
  }

  @computed
  get filterRegularExpression() {
    return new RegExp(
      `"msg":"(${PanelStore.settingStore.activeFilterBlacklist.join('|')})"`,
    )
  }

  @computed
  get subscriptionLogs() {
    return this.collection.filter(
      log =>
        log.parsedContent.msg === 'ready' || log.parsedContent.msg === 'sub',
    )
  }

  @computed
  get methodLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'method')
  }

  @computed
  get resultLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'result')
  }

  @computed
  get updatedLogs() {
    return this.collection.filter(log => log.parsedContent.msg === 'updated')
  }

  getSubscriptionInit(subscription) {
    return this.subscriptionLogs.find(
      log => log.parsedContent.id === subscription.id,
    )
  }

  getSubscriptionReady(subscription) {
    return this.subscriptionLogs.find(log =>
      log.parsedContent.subs?.includes?.(subscription.id),
    )
  }

  getSubscriptionDuration(subscription) {
    const initLog = this.getSubscriptionInit(subscription)
    const readyLog = this.getSubscriptionReady(subscription)

    if (initLog && readyLog)
      return `${readyLog.timestamp - initLog.timestamp}ms`

    if (readyLog) return `???`

    if (initLog) return `waiting`

    return 'NA'
  }

  getSubscriptionMeta(subscription) {
    return {
      meta: {
        init: this.getSubscriptionInit(subscription),
        ready: this.getSubscriptionReady(subscription),
      },
    }
  }

  getMethodResult(methodId: string) {
    return this.resultLogs.find(log => log.parsedContent.id === methodId)
  }

  getMethodUpdated(methodId: string) {
    return this.updatedLogs.find(log =>
      log.parsedContent.methods?.includes(methodId),
    )
  }

  getMethodLatency(methodId: string) {
    const methodLog = this.methodLogs.find(
      log => log.parsedContent.id === methodId,
    )
    const resultLog = this.getMethodResult(methodId)
    const updatedLog = this.getMethodUpdated(methodId)

    if (!methodLog || !resultLog) return null

    return {
      timeToResult: resultLog.timestamp - methodLog.timestamp,
      timeToReady: updatedLog
        ? updatedLog.timestamp - methodLog.timestamp
        : null,
      methodName: methodLog.parsedContent.method,
      params: methodLog.parsedContent.params,
    }
  }
}
