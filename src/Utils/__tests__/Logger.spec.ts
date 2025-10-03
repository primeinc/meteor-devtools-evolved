import { Logger, createLogger } from '../Logger'

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance
  let consoleInfoSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation()
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createLogger', () => {
    it('should create a logger with context', () => {
      const logger = createLogger('TestContext')
      expect(logger).toBeInstanceOf(Logger)
    })
  })

  describe('Logger instance', () => {
    it('should log debug messages with context prefix', () => {
      const logger = new Logger('TestContext')
      logger.debug('test message', { foo: 'bar' })

      expect(consoleDebugSpy).toHaveBeenCalledWith('[TestContext]', 'test message', { foo: 'bar' })
    })

    it('should log info messages with context prefix', () => {
      const logger = new Logger('TestContext')
      logger.info('test message')

      expect(consoleInfoSpy).toHaveBeenCalledWith('[TestContext]', 'test message')
    })

    it('should log warn messages with context prefix', () => {
      const logger = new Logger('TestContext')
      logger.warn('warning message')

      expect(consoleWarnSpy).toHaveBeenCalledWith('[TestContext]', 'warning message')
    })

    it('should log error messages with context prefix', () => {
      const logger = new Logger('TestContext')
      logger.error('error message', new Error('test'))

      expect(consoleErrorSpy).toHaveBeenCalledWith('[TestContext]', 'error message', expect.any(Error))
    })

    it('should handle multiple arguments', () => {
      const logger = new Logger('TestContext')
      logger.info('message', 'arg1', 'arg2', { foo: 'bar' })

      expect(consoleInfoSpy).toHaveBeenCalledWith('[TestContext]', 'message', 'arg1', 'arg2', { foo: 'bar' })
    })

    it('should use correct log level methods', () => {
      const logger = new Logger('TestContext')

      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1)
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('context naming', () => {
    it('should support different context names', () => {
      const logger1 = createLogger('Export')
      const logger2 = createLogger('MinimongoStore')

      logger1.info('from export')
      logger2.info('from store')

      expect(consoleInfoSpy).toHaveBeenCalledWith('[Export]', 'from export')
      expect(consoleInfoSpy).toHaveBeenCalledWith('[MinimongoStore]', 'from store')
    })
  })
})
