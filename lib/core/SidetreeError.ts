/**
 * Standardized error class for throwing generic errors internal to this project.
 * NOTE: Not to be confused with RequestError which is used as a response to external requests.
 */
export default class SidetreeError extends Error {
  constructor (public code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a new SidetreeError object using the inputs.
   *
   * @param code The error code.
   * @param err The error exception thrown.
   */
  public static createFromError (code: string, err: Error): SidetreeError {
    return new SidetreeError(code, err ? err.message : undefined);
  }
}
