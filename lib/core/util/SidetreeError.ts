/**
 * Generic Sidetree errors
 */
export default class SidetreeError extends Error {
  constructor (public readonly status: number, message?: string) {
    super(message);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
