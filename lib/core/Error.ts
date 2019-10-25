/**
 * Standardized error class for throwing generic errors internal to this project.
 * NOTE: Not to be confused with RequestError which is used as a response to external requests.
 */
export class SidetreeError extends Error {
  constructor (public code: string, message?: string) {
    super(message ? `${code}: message` : code);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
