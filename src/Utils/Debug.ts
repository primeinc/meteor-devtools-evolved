/**
 * Debug utility for gated logging
 * Logs are only output when DEBUG flag is enabled
 */

const DEBUG = process.env.MODE === 'development'

export const debug = {
  log: (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(...args)
    }
  },
  info: (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.info(...args)
    }
  },
  warn: (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.warn(...args)
    }
  },
  debug: (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(...args)
    }
  },
  trace: (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.trace(...args)
    }
  },
}
