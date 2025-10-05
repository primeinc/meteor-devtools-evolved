type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class Logger {
  constructor(private context: string) {}

  private log(level: LogLevel, ...args: any[]) {
    const prefix = `[${this.context}]`
    const method = console[level] || console.log
    method(prefix, ...args)
  }

  debug(...args: any[]) {
    this.log('debug', ...args)
  }

  info(...args: any[]) {
    this.log('info', ...args)
  }

  warn(...args: any[]) {
    this.log('warn', ...args)
  }

  error(...args: any[]) {
    this.log('error', ...args)
  }
}

/**
 * Creates a logger instance with the specified context.
 *
 * @param context - The context name for log messages
 * @returns A new Logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context)
}
