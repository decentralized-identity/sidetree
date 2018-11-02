/**
 * Defines a Sidetree response object.
 */
interface Response {
  status: ResponseStatus;
  body?: object;
}

/**
 * Possible Sidetree response status.
 */
enum ResponseStatus {
  BadRequest,
  NotFound,
  ServerError,
  Succeeded
}

/**
 * Converts a Sidetree response status to an HTTP status.
 */
function toHttpStatus (status: ResponseStatus): number {
  switch (status) {
    case ResponseStatus.Succeeded:
      return 200;
    case ResponseStatus.BadRequest:
      return 400;
    case ResponseStatus.NotFound:
      return 404;
    default:
      return 500;
  }
}

export { Response, ResponseStatus, toHttpStatus };
