/**
 * Type definitions for Minimongo query logging
 */

export interface MinimongoMethodLog {
  collectionName: string
  method: 'find' | 'findOne' | 'insert' | 'update' | 'upsert' | 'remove'
  selector?: any
  modifier?: any
  options?: any
  runtime: number
  stackTrace?: string
  timestamp: number
}
