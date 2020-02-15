import DidPublicKeyModel from './models/DidPublicKeyModel';
import DidServiceEndpointModel from './models/DidServiceEndpointModel';
import DocumentModel from './models/DocumentModel';
import Encoder from './Encoder';
import InternalDocumentModel from './models/InternalDocumentModel';

/**
 * Class containing reusable DID Document related operations specific to Sidetree.
 */
export default class Document {
  /**
   * Transforms the given internal document model into a DID Document.
   */
  public static transformToDidDocument (didMethodName: string, internalDocumentModel: InternalDocumentModel): any {
    const did = didMethodName + internalDocumentModel.didUniqueSuffix;
    const didDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: internalDocumentModel.document.publicKey,
      service: internalDocumentModel.document.service,
      recoveryKey: internalDocumentModel.recoveryKey
    };

    Document.addDidToDocument(didDocument, did);

    return didDocument;
  }

  /**
   * Verifies that the given encoded string is a valid encoded DID Document that can be accepted by the Sidetree create operation.
   * @param allowedMaxSizeInBytes Optional. If specified, the given size limit is validated against the decoded buffer of the original DID document.
   */
  public static isEncodedStringValidOriginalDocument (encodedOriginalDocument: string, allowedMaxSizeInBytes?: number): boolean {
    const originalDocumentBuffer = Encoder.decodeAsBuffer(encodedOriginalDocument);

    // Verify size of each operation does not exceed the maximum allowed limit.
    if (allowedMaxSizeInBytes !== undefined &&
      originalDocumentBuffer.length > allowedMaxSizeInBytes) {
      return false;
    }

    // Try to parse the buffer as a JSON object.
    let originalDocument;
    try {
      originalDocument = JSON.parse(originalDocumentBuffer.toString());
    } catch {
      return false;
    }

    // Verify additional Sidetree-specific rules for a valid original DID Document.
    const isValidOriginalDidDocument = Document.isObjectValidOriginalDocument(originalDocument);
    return isValidOriginalDidDocument;
  }

  /**
   * Verifies that the given JSON object is a valid Sidetree specific encoded DID Document that can be accepted by the Sidetree create operation.
   */
  public static isObjectValidOriginalDocument (originalDocument: any): boolean {
    // Original document must pass generic DID Document schema validation.
    const isValidGenericDidDocument = Document.isValid(originalDocument, false);
    if (!isValidGenericDidDocument) {
      return false;
    }

    // 'publicKey' property is required and must be an array that is not empty.
    if (!Array.isArray(originalDocument.publicKey) ||
        (originalDocument.publicKey as object[]).length === 0) {
      return false;
    }

    // Keeps the count of keys for each usage.
    const keyUsages = new Map<string, number>();

    // Verify each publicKey entry in array.
    for (let publicKeyEntry of originalDocument.publicKey) {
      // 'id' must be a fragment (starts with '#').
      if (!(publicKeyEntry.id as string).startsWith('#')) {
        return false;
      }

      // A valid Sidetree public key must contain a custom 'usage' property.
      if (typeof publicKeyEntry.usage !== 'string') {
        return false;
      }

      // Increment the count of the corresponding key usage.
      const usageCount = keyUsages.get(publicKeyEntry.usage);
      if (usageCount === undefined) {
        keyUsages.set(publicKeyEntry.usage, 1);
      } else {
        keyUsages.set(publicKeyEntry.usage, usageCount + 1);
      }

      // Controller field is not allowed to be filled in by the client
      if (publicKeyEntry.controller !== undefined) {
        return false;
      }
    }

    // Must contain one and only one recovery key.
    if (keyUsages.get('recovery') !== 1) {
      return false;
    }

    // Must contain at least one signing key.
    if (keyUsages.get('signing') === undefined) {
      return false;
    }
    return true;
  }

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
