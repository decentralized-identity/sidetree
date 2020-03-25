/**
 * Return code for a content fetch.
 */
enum FetchResultCode {
  CasNotReachable = 'cas_not_reachable',
  InvalidHash = 'content_hash_invalid',
  MaxSizeExceeded = 'content_exceeds_maximum_allowed_size',
  MaxSizeNotSpecified = 'content_max_size_not_specified',
  NotAFile = 'content_not_a_file',
  NotFound = 'content_not_found',
  Success = 'success'
}

export default FetchResultCode;
