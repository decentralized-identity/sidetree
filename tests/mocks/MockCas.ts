import Encoder from '../../src/Encoder';
import Multihash from '../../src/Multihash';
import { Cas } from '../../src/Cas';

/**
 * Implementation of a CAS class for testing.
 * Simply using a hash map to store all the content by hash.
 */
export default class MockCas implements Cas {
  /** A Map that stores the given content. */
  private storage: Map<string, Buffer> = new Map();

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

  public async read (address: string): Promise<Buffer> {
    const content = this.storage.get(address);
    return content ? content : Buffer.from('');
  }
}
