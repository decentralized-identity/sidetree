import DidPublicKeyModel from './models/DidPublicKeyModel';
import DidServiceEndpointModel from './models/DidServiceEndpointModel';
import DocumentModel from './models/DocumentModel';

/**
 * Class containing reusable DID Document related operations specific to Sidetree.
 */
export default class DidDocument {
  /**
   * Gets the specified public key from the given DID Document.
   * Returns undefined if not found.
   * @param keyId The ID of the public-key.
   */
  public static getPublicKey (didDocument: DocumentModel, keyId: string): DidPublicKeyModel | undefined {
    for (let i = 0; i < didDocument.publicKey.length; i++) {
      const publicKey = didDocument.publicKey[i];

      if (publicKey.id && publicKey.id.endsWith(keyId)) {
        return publicKey;
      }
    }

    return undefined;
  }

  /**
   * Creates a DID document model.
   * Mainly used by tests.
   */
  public static create (publicKeys: DidPublicKeyModel[], services?: DidServiceEndpointModel[]): DocumentModel {

    return {
      '@context': 'https://w3id.org/did/v1',
      publicKey: publicKeys,
      service: services
    };
  }
}
