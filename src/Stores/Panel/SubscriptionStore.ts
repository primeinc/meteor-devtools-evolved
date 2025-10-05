import { Searchable } from '@/Stores/Common/Searchable'
import { computed, makeObservable } from 'mobx'
import { PanelStore } from '@/Stores/PanelStore'

export class SubscriptionStore extends Searchable<IMeteorSubscription> {
  constructor() {
    super()
    makeObservable(this)
  }

  filterFunction = (collection: IMeteorSubscription[], search: string) =>
    collection.filter(
      document =>
        !search ||
        JSON.stringify(document).toLowerCase().includes(search.toLowerCase()),
    )

  @computed
  get subsWithMeta() {
    return this.filtered.map(sub => ({
      ...sub,
      ...PanelStore.ddpStore.getSubscriptionMeta(sub),
      ...this.getDataLoadMetrics(sub),
    }))
  }

  getDataLoadMetrics(sub: IMeteorSubscription) {
    const initLog = PanelStore.ddpStore.getSubscriptionInit(sub)
    const readyLog = PanelStore.ddpStore.getSubscriptionReady(sub)

    if (!initLog || !readyLog) return {}

    // Find all 'added' messages between init and ready (initial load)
    const addedMessages = PanelStore.ddpStore.collection.filter(
      log =>
        log.parsedContent.msg === 'added' &&
        log.timestamp >= initLog.timestamp &&
        log.timestamp <= readyLog.timestamp,
    )

    // Sum byte sizes for initial load
    const totalBytes = addedMessages.reduce((sum, log) => {
      const byteSize =
        log.byteSize ||
        new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
      return sum + byteSize
    }, 0)

    // Calculate update metrics (ongoing updates AFTER ready)
    const updateMessages = PanelStore.ddpStore.collection.filter(
      log =>
        ['added', 'changed', 'removed'].includes(log.parsedContent.msg) &&
        log.timestamp > readyLog.timestamp,
    )

    const now = Date.now()
    const lifetimeSeconds = (now - readyLog.timestamp) / 1000
    const updateRate =
      lifetimeSeconds > 0 ? (updateMessages.length / lifetimeSeconds) * 60 : 0

    const totalUpdateVolume = updateMessages.reduce((sum, log) => {
      const byteSize =
        log.byteSize ||
        new TextEncoder().encode(JSON.stringify(log.parsedContent)).length
      return sum + byteSize
    }, 0)

    return {
      startTime: initLog.timestamp,
      readyTime: readyLog.timestamp,
      initialDataLoadBytes: totalBytes,
      updateRate,
      totalUpdateVolume,
    }
  }
}
