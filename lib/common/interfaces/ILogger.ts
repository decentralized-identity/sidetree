/**
 * Logging interface used in Sidetree.
 */
export default interface ILogger {
  /**
   * Logs informational data.
   */
  info (data: any): void;

  /**
   * Logs warning.
   */
  warn (data: any): void;

  /**
   * Logs error.
   */
  error (data: any): void;
}
