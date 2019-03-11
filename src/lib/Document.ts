import Did from './Did';
import Encoder from '../Encoder';
import { DidDocument, DidPublicKey } from '@decentralized-identity/did-common-typescript';

/**
 * Class containing reusable DID Document related operations specific to Sidetree.
 * NOTE: The class is intentionally named to disambiguate from the `DidDocument` class in '@decentralized-identity/did-common-typescript'.
 */
export default class Document {
  /**
   * Creates a DID Document with a valid Sidetree DID from an encoded initial Sidetree DID document.
   */
  public static from (encodedDidDocument: string, didMethodName: string, hashAlgorithmAsMultihashCode: number): DidDocument {
    // Compute the hash of the DID Document in the create payload as the DID
    const did = Did.from(encodedDidDocument, didMethodName, hashAlgorithmAsMultihashCode);

    // Decode the encoded DID Document.
    const decodedJsonString = Encoder.decodeAsString(encodedDidDocument);
    const decodedDidDocument = JSON.parse(decodedJsonString);

    // Construct real DID document and return it.
    // NOTE: DidDocument class requires 'id' property, where as Sidetree original document does not.
    // So here we create a placeholder 'id' property before passing to DidDocument constructor.
    decodedDidDocument.id = 'placeholder';
    const didDocument = new DidDocument(decodedDidDocument);

    // Replace the placeholder DID with real DID before returning it.
    didDocument.id = did;
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
   * Verifies that the given JSON object is a valid encoded DID Document that can be accepted by the Sidetree create operation.
   */
  public static isObjectValidOriginalDocument (originalDocument: any): boolean {
    // Original document must pass generic DID Document schema validation.
    const isValidGenericDidDocument = Document.isValid(originalDocument, false);
    if (!isValidGenericDidDocument) {
      return false;
    }

    // 'publicKey' property must be an array.
    if (!Array.isArray(originalDocument.publicKey)) {
      return false;
    }

    // Verify each publicKey entry in array.
    for (let publicKeyEntry of originalDocument.publicKey) {
      // 'id' must be string type.
      if (typeof publicKeyEntry.id !== 'string') {
        return false;
      }

      // 'id' must be a fragment (starts with '#').
      if (!(publicKeyEntry.id as string).startsWith('#')) {
        return false;
      }
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

    // Verify 'id' property.
    if (requireId && !didDocument.hasOwnProperty('id')) {
      return false;
    }

    // Verify required '@context' property.
    if (didDocument['@context'] !== 'https://w3id.org/did/v1') {
      return false;
    }

    return true;
  }

  /**
   * Gets the specified public key from the given DID Document.
   * Returns undefined if not found.
   * @param keyId The ID of the public-key.
   */
  public static getPublicKey (didDocument: DidDocument, keyId: string): DidPublicKey | undefined {
    for (let i = 0; i < didDocument.publicKey.length; i++) {
      const publicKey = didDocument.publicKey[i];

      if (publicKey.id && publicKey.id.endsWith(keyId)) {
        return publicKey;
      }
    }

    return undefined;
  }
}
