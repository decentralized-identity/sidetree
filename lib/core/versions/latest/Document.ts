import DidPublicKeyModel from './models/DidPublicKeyModel';
import DidServiceEndpointModel from './models/DidServiceEndpointModel';
import DocumentModel from './models/DocumentModel';

/**
 * Class containing reusable DID Document related operations specific to Sidetree.
 */
export default class Document {

  /**
   * Verifies that the given object is a valid generic DID Document (not Sidetree specific).
   * @param requireDid Optional. Specifies if validation rules require the `id` property. Defaults to true if not given.
   */
  public static isValid (didDocument: any, requireId?: boolean): boolean {
    if (requireId === undefined) {
      requireId = true;
    }

    if (didDocument === undefined) {
      return false;
    }

    // Verify 'id' property.
    if (requireId && !didDocument.hasOwnProperty('id')) {
      return false;
    }

    // Verify required '@context' property.
    if (didDocument['@context'] !== 'https://w3id.org/did/v1') {
      return false;
    }

    // Verify 'publicKey' property if it exists.
    if (didDocument.hasOwnProperty('publicKey')) {

      if (!Array.isArray(didDocument.publicKey)) {
        return false;
      }

      // Verify each publicKey entry in array.
      const publicKeyIdSet: Set<string> = new Set();
      for (let publicKeyEntry of didDocument.publicKey) {
        // 'id' must be string type.
        if (typeof publicKeyEntry.id !== 'string') {
          return false;
        }

        // 'id' must be unique
        if (publicKeyIdSet.has(publicKeyEntry.id)) {
          return false;
        }
        publicKeyIdSet.add(publicKeyEntry.id);

        if (typeof publicKeyEntry.type !== 'string') {
          return false;
        }
      }
    }

    // Verify 'service' property if it exists.
    if (didDocument.hasOwnProperty('service')) {
      // 'service' property must be an array.
      if (!Array.isArray(didDocument.service)) {
        return false;
      }

      // Verify each service entry in array.
      for (let serviceEntry of didDocument.service) {
        // 'type' is required and must be string type.
        if (typeof serviceEntry.type !== 'string') {
          return false;
        }

        // 'serviceEndpoint' is required.
        if (typeof serviceEntry.serviceEndpoint !== 'string' && typeof serviceEntry.serviceEndpoint !== 'object') {
          return false;
        }
      }
    }

    return true;
  }

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
   */
  public static create (publicKeys: DidPublicKeyModel[], services?: DidServiceEndpointModel[]): DocumentModel {

    return {
      '@context': 'https://w3id.org/did/v1',
      publicKey: publicKeys,
      service: services
    };
  }

  /**
   * Adds DID references in the document using the given DID
   * because client creating the document will not have these value set.
   * Specifically:
   * 1. `id` is added.
   * 1. `controller` of the public-keys is added.
   *
   * @param didDocument The document to update.
   * @param did The DID which gets added to the document.
   */
  public static addDidToDocument (didDocument: DocumentModel, did: string): void {

    didDocument.id = did;

    // Only update the publickey if the array is present
    if (Array.isArray(didDocument.publicKey)) {
      for (let publicKeyEntry of didDocument.publicKey) {
        publicKeyEntry.controller = did;
      }
    }
  }
}
