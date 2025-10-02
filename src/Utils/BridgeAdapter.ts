/**
 * Bridge adapter to normalize messaging API
 * Provides post/on/off pattern over existing Bridge.sendContentMessage/register
 */

import { Bridge } from '@/Bridge'

export type Handler<T = any> = (payload: T) => void

export const BridgeAdapter = {
  post<T = any>(eventType: EventType, payload?: T): void {
    Bridge.sendContentMessage({ eventType, data: payload })
  },

  on<T = any>(eventType: EventType, handler: Handler<T>): void {
    Bridge.register(eventType, (message: Message<T>) => {
      handler(message.data)
    })
  },

  off<T = any>(eventType: EventType, handler: Handler<T>): void {
    // Bridge only supports one handler per event type, so we just unregister the event
    Bridge.unregister(eventType)
  },
}
