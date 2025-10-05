import { PanelStore } from '@/Stores/PanelStore'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'

export interface CorrelationResult {
  addedDocuments: number
  changedDocuments: number
  removedDocuments: number
  correlationConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
}

export class MinimongoDDPCorrelator {
  /**
   * Find DDP messages that added documents to a collection
   */
  getDDPAddsForCollection(collectionName: string) {
    return PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent?.msg === 'added' &&
      log.parsedContent?.collection === collectionName
    )
  }

  /**
   * Find DDP messages that changed documents in a collection
   */
  getDDPChangesForCollection(collectionName: string) {
    return PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent?.msg === 'changed' &&
      log.parsedContent?.collection === collectionName
    )
  }

  /**
   * Find DDP messages that removed documents from a collection
   */
  getDDPRemovedForCollection(collectionName: string) {
    return PanelStore.ddpStore.collection.filter(log =>
      log.parsedContent?.msg === 'removed' &&
      log.parsedContent?.collection === collectionName
    )
  }

  /**
   * Correlate a Minimongo query with DDP activity
   * Uses 100ms time window for correlation
   */
  getCorrelationForQuery(log: MinimongoMethodLog): CorrelationResult {
    const { collectionName, timestamp } = log

    // Find recent DDP activity (within 100ms)
    const recentDDP = PanelStore.ddpStore.collection.filter(ddpLog => {
      if (!ddpLog.parsedContent?.collection || !ddpLog.timestamp) {
        return false
      }
      return (
        ddpLog.parsedContent.collection === collectionName &&
        Math.abs(ddpLog.timestamp - timestamp) < 100
      )
    })

    // Count document types in a single pass
    const counts = recentDDP.reduce(
      (acc, log) => {
        const msg = log.parsedContent?.msg
        if (msg === 'added') acc.addedDocuments++
        else if (msg === 'changed') acc.changedDocuments++
        else if (msg === 'removed') acc.removedDocuments++
        return acc
      },
      { addedDocuments: 0, changedDocuments: 0, removedDocuments: 0 }
    )

    // Determine correlation confidence
    let correlationConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
    const totalDDPActivity = recentDDP.length

    if (totalDDPActivity === 0) {
      correlationConfidence = 'NONE'
    } else if (totalDDPActivity >= 5) {
      correlationConfidence = 'HIGH'
    } else if (totalDDPActivity >= 2) {
      correlationConfidence = 'MEDIUM'
    } else {
      correlationConfidence = 'LOW'
    }

    return {
      ...counts,
      correlationConfidence
    }
  }
}

export const minimongoCorrelator = new MinimongoDDPCorrelator()
