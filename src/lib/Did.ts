import Encoder from '../Encoder';
import Multihash from '../Multihash';

/**
 * Class containing reusable DID related operations.
 */
export default class Did {
  /**
   * Calculates the DID from the given DID Document.
   */
  public static from (encodedDidDocument: string, didMethodName: string, hashAlgorithmAsMultihashCode: number): string {
    const didDocumentBuffer = Buffer.from(encodedDidDocument);
    const multihash = Multihash.hash(didDocumentBuffer, hashAlgorithmAsMultihashCode);
    const encodedMultihash = Encoder.encode(multihash);
    const did = didMethodName + encodedMultihash;
    return did;
  }

  /**
   * Gets the unique portion of the DID. e.g. "did:sidetree:12345" -> "12345"
   */
  public static getUniqueSuffix (did: string): string {
    const lastColonIndex = did.lastIndexOf(':');
    const uniqueSuffix = did.substring(lastColonIndex + 1);
    return uniqueSuffix;
  }
}
