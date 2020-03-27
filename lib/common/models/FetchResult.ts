import FetchResultCode from '../enums/FetchResultCode';

/**
 * Data structure representing the result of a content fetch from the Content Addressable Storage.
 */
export default interface FetchResult {
  /** Return code for the fetch. */
  code: FetchResultCode;
  content?: Buffer;
}
