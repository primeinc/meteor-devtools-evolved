import { Searchable } from '@/Stores/Common/Searchable'
import { computed, makeObservable } from 'mobx'
import { PanelStore } from '@/Stores/PanelStore'

// Reuse single TextEncoder instance for performance
const textEncoder = new TextEncoder()

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

  /**
   * Helper to calculate byte size of a DDP log entry
   */
  private getLogByteSize(log: DDPLog): number {
    return (
      log.byteSize ||
      textEncoder.encode(JSON.stringify(log.parsedContent)).length
    )
  }

  getDataLoadMetrics(sub: IMeteorSubscription) {
    const initLog = PanelStore.ddpStore.getSubscriptionInit(sub)
    const readyLog = PanelStore.ddpStore.getSubscriptionReady(sub)

    if (!initLog || !readyLog) return {}

    // NOTE: DDP protocol limitation - 'added'/'changed'/'removed' messages don't include
    // subscription IDs, only collection names. This makes perfect attribution impossible
    // when multiple subscriptions publish to the same collection. We use timestamp windows
    // as a best-effort approximation. This may include data from overlapping subscriptions.

    // Find all 'added' messages between init and ready (initial load)
    const addedMessages = PanelStore.ddpStore.collection.filter(
      log =>
        log.parsedContent.msg === 'added' &&
        log.timestamp >= initLog.timestamp &&
        log.timestamp <= readyLog.timestamp,
    )

    const totalBytes = addedMessages.reduce(
      (sum, log) => sum + this.getLogByteSize(log),
      0,
    )

    // Calculate update metrics (ongoing updates AFTER ready)
    // NOTE: Same limitation applies - includes all updates in this time window
    const updateMessages = PanelStore.ddpStore.collection.filter(
      log =>
        ['added', 'changed', 'removed'].includes(log.parsedContent.msg) &&
        log.timestamp > readyLog.timestamp,
    )

    const now = Date.now()
    const lifetimeSeconds = (now - readyLog.timestamp) / 1000
    const updateRate =
      lifetimeSeconds > 0 ? (updateMessages.length / lifetimeSeconds) * 60 : 0

    const totalUpdateVolume = updateMessages.reduce(
      (sum, log) => sum + this.getLogByteSize(log),
      0,
    )

    return {
      startTime: initLog.timestamp,
      readyTime: readyLog.timestamp,
      initialDataLoadBytes: totalBytes,
      updateRate,
      totalUpdateVolume,
    }
  }
}
