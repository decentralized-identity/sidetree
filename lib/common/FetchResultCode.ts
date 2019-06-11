/**
 * Return code for a content fetch.
 */
export enum FetchResultCode {
  Success = 'success',
  NotFound = 'content_not_found',
  MaxSizeExceeded = 'content_exceeds_maximum_allowed_size',
  MaxSizeNotSpecified = 'content_max_size_not_specified',
  NotAFile = 'content_not_a_file',
  InvalidHash = 'content_hash_invalid'
}
