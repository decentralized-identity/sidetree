/**
 * Generic Sidetree errors
 */
export default class SidetreeError extends Error {

  /**
   * Gets an HTTP status number according to the response code.
   * This is used by some middleware solutions on error handling.
   */
  public get status (): number {
    switch (this.responseCode) {
      case StatusCode.BadRequest:
        return 400;
      case StatusCode.Unauthoried:
        return 401;
      case StatusCode.NotFound:
        return 404;
      case StatusCode.ServerError:
      default:
        return 500;
    }
  }

  /** Koa property used to determine if the error message should be returned */
  public get expose (): boolean {
    return this.code !== undefined;
  }

  constructor (public readonly responseCode: StatusCode, public readonly code?: Code, message?: string) {
    super(message);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Response status codes correlated with this error
 */
export enum StatusCode {
  BadRequest = 'badRequest',
  Unauthoried = 'unauthorized',
  NotFound = 'notFound',
  ServerError = 'internalError'
}

/**
 * Additional error codes to include with this error
 */
export enum Code {
  InvalidHash = 'invalid_transaction_number_or_time_hash'
}
