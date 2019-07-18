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
   * Checks to see if the given string is a valid generic DID.
   */
  public static isDid (did: string): boolean {
    if (!did.startsWith('did:')) {
      return false;
    }

    const uniqueSuffixWithMethodName = did.substring(4); // e.g. 'sidetree:abc'
    const indexOfColonChar = uniqueSuffixWithMethodName.indexOf(':');

    // ':' must exists and not be the first or last character.
    if (indexOfColonChar <= 0 ||
        indexOfColonChar === (uniqueSuffixWithMethodName.length - 1)) {
      return false;
    }

    return true;
  }
}
