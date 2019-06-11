import Encoder from '../../lib/core/Encoder';
import Multihash from '../../lib/core/Multihash';
import { Cas, FetchResult } from '../../lib/core/Cas';
import { FetchResultCode } from '../../lib/common/FetchResultCode';

/**
 * Implementation of a CAS class for testing.
 * Simply using a hash map to store all the content by hash.
 */
export default class MockCas implements Cas {
  /** A Map that stores the given content. */
  private storage: Map<string, Buffer> = new Map();

  /** Time taken in seconds for each mock fetch. */
  private mockSecondsTakenForEachCasFetch = 0;

  constructor (mockSecondsTakenForEachCasFetch?: number) {
    if (mockSecondsTakenForEachCasFetch !== undefined) {
      this.mockSecondsTakenForEachCasFetch = mockSecondsTakenForEachCasFetch;
    }
  }

  /**
   * Gets the address that can be used to access the given content.
   */
  public static getAddress (content: Buffer): string {
    const hash = Multihash.hash(content, 18); // SHA256
    const encodedHash = Encoder.encode(hash);

    return encodedHash;
  }

  public async write (content: Buffer): Promise<string> {
    const encodedHash = MockCas.getAddress(content);
    this.storage.set(encodedHash, content);
    return encodedHash;
  }

  public async read (address: string, _maxSizeInBytes: number): Promise<FetchResult> {
    // Wait for configured time before returning.
    await new Promise(resolve => setTimeout(resolve, this.mockSecondsTakenForEachCasFetch * 1000));

    const content = this.storage.get(address);

    if (content === undefined) {
      return {
        code: FetchResultCode.NotFound
      };
    }

    return {
      code: FetchResultCode.Success,
      content
    };
  }
}
