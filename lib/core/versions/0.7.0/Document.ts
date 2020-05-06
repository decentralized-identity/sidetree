import DocumentModel from './models/DocumentModel';
import PublicKeyModel from './models/PublicKeyModel';

/**
 * Class containing reusable document related operations.
 * NOTE: This class should ONLY be used by the `DocumentComposer`.
 */
export default class Document {
  /**
   * Gets the specified public key from the given DID Document.
   * Returns undefined if not found.
   * @param keyId The ID of the public-key.
   */
  public static getPublicKey (document: DocumentModel, keyId: string): PublicKeyModel | undefined {
    for (let i = 0; i < document.publicKeys.length; i++) {
      const publicKey = document.publicKeys[i];

      if (publicKey.id === keyId) {
        return publicKey;
      }
    }

    return undefined;
  }
}
