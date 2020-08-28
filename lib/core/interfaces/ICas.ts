import FetchResult from '../../common/models/FetchResult';
/**
 * Interface for accessing the underlying CAS (Content Addressable Store).
 * This interface is mainly useful for creating a mock CAS for testing purposes.
 */
export default interface ICas {
  /**
   * Writes the given content to CAS.
   * @returns The SHA256 hash in base64url encoding which represents the address of the content.
   */
  write (content: Buffer): Promise<string>;
  /**
   * Reads the content of the given address in CAS.
   * @param maxSizeInBytes The maximum allowed size limit of the content.
   * @returns The fetch result containing the content buffer if found.
   *          The result `code` is set to `FetchResultCode.MaxSizeExceeded` if the content exceeds the specified max size.
   */
  read (address: string, maxSizeInBytes: number): Promise<FetchResult>;
}
