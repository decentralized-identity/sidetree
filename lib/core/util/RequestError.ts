import Response, { ResponseStatus } from '../Response';

/**
 * Error class used as a response to external requests.
 */
export default class RequestError extends Error {

  /**
   * Gets an HTTP status number according to the response code.
   * This is used by some middleware solutions on error handling.
   */
  public get status (): number {
    return Response.toHttpStatus(this.responseCode);
  }

  /** Koa property used to determine if the error message should be returned */
  public get expose (): boolean {
    return this.code !== undefined;
  }

  constructor (public readonly responseCode: ResponseStatus, public readonly code?: ErrorCode) {
    super(code ? JSON.stringify({ code }) : undefined);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error codes to include with the response body.
 */
export enum ErrorCode {
  InvalidTransactionNumberOrTimeHash = 'invalid_transaction_number_or_time_hash'
}
