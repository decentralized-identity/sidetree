import Encoder from './Encoder';
import Multihash from './Multihash';

/**
 * Class containing reusable DID related operations.
 */
export default class Did {
  /**
   * Calculates the DID from the given DID Document.
   */
  public static from (encodedDidDocument: string, didMethodName: string, hashAlgorithmAsMultihashCode: number): string {
    const didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(encodedDidDocument, hashAlgorithmAsMultihashCode);
    const did = didMethodName + didUniqueSuffix;
    return did;
  }

  /**
   * Gets the unique portion of the DID generated from an encoded DID Document. e.g. "did:sidetree:12345" -> "12345"
   */
  public static getUniqueSuffixFromEncodeDidDocument (encodedDidDocument: string, hashAlgorithmAsMultihashCode: number): string {
    const didDocumentBuffer = Buffer.from(encodedDidDocument);
    const multihash = Multihash.hash(didDocumentBuffer, hashAlgorithmAsMultihashCode);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
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
