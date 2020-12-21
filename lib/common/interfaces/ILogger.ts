/**
 * Custom logger interface.
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
