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
    if (Array.isArray(document.public_keys)) {
      for (let i = 0; i < document.public_keys.length; i++) {
        const publicKey = document.public_keys[i];

        if (publicKey.id === keyId) {
          return publicKey;
        }
      }
    }
    return undefined;
  }
}
