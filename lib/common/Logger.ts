import ConsoleLogger from './ConsoleLogger';
import ILogger from './interfaces/ILogger';

/**
 * Logger used in Sidetree.
 * Intended to be human readable for debugging.
 */
export default class Logger {
  private static singleton: ILogger = new ConsoleLogger();

  /**
   * Overrides the default logger if given.
   */
  static initialize (customLogger?: ILogger) {
    if (customLogger !== undefined) {
      Logger.singleton = customLogger;
    }
  }

  /**
   * Logs info.
   */
  public static info (data: any): void {
    Logger.singleton.info(data);
  }

  /**
   * Logs warning.
   */
  public static warn (data: any): void {
    Logger.singleton.warn(data);
  }

  /**
   * Logs error.
   */
  public static error (data: any): void {
    Logger.singleton.error(data);
  }
}
