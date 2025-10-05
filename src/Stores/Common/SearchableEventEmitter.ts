import EventEmitter from 'eventemitter3'
import { Searchable } from './Searchable'

/**
 * Extends Searchable with EventEmitter capabilities through composition.
 * Provides a clean way to add event-driven functionality to searchable stores.
 */
export class SearchableEventEmitter<T> extends Searchable<T> {
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
