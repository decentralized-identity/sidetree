/**
 * Defines a Sidetree response object.
 */
interface IResponse {
  status: ResponseStatus;
  body?: any;
}

/**
 * Possible Sidetree response status.
 */
enum ResponseStatus {
  BadRequest = 'bad-request',
  NotFound = 'not-found',
  ServerError = 'server-error',
  Succeeded = 'succeeded'
}

/**
 * Contains operations related to `IResponse`.
 */
export default class Response {
  /**
   * Converts a Sidetree response status to an HTTP status.
   */
  public static toHttpStatus (status: ResponseStatus): number {
    switch (status) {
      case ResponseStatus.Succeeded:
        return 200;
      case ResponseStatus.BadRequest:
        return 400;
      case ResponseStatus.NotFound:
        return 404;
      case ResponseStatus.ServerError:
      default:
        return 500;
    }
  }
}

export { IResponse, Response, ResponseStatus };
