import Response from '../common/Response';
import ResponseStatus from '../common/enums/ResponseStatus';

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

  constructor (public readonly responseCode: ResponseStatus, public readonly code?: string) {
    super(code ? JSON.stringify({ code }) : undefined);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
