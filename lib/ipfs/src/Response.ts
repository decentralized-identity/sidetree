/**
 * Defines a Sidetree response object.
 * NOTE: The interface is intentionally HTTP agnostic.
 */
interface Response {
  /**
   * Status Code.
   */
  status: ResponseStatus;
  /**
   * Response Body.
   */
  body?: object;
}

/**
 * Possible Sidetree response status.
 */
enum ResponseStatus {
  Succeeded,
  BadRequest,
  ServerError,
  NotFound
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
