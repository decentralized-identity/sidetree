import Did from './Did';
import Encoder from '../Encoder';
import { DidPublicKey } from '@decentralized-identity/did-common-typescript';

/**
 * Defines DID Document data structure used by Sidetree for basic type safety checks.
 */
export interface IDocument {
  '@context': string;
  id: string;
  publicKey: [{
    id: string,
    type: string,
    publicKeyJwk?: object
    publicKeyHex?: object
  }];
  service: [{
    type: string,
    serviceEndpoint: {
      '@context': string;
      '@type': string;
      instance: [string]
    }
  }];
}

/**
 * Class containing reusable DID Document related operations specific to Sidetree.
 * NOTE: The class is intentionally named to disambiguate from the `DidDocument` class in '@decentralized-identity/did-common-typescript'.
 */
export default class Document {
  /**
   * Creates a DID Document with a valid Sidetree DID from an encoded original DID Document.
   * @returns DID Document if encoded original DID Document is valid; `undefined` otherwise.
   */
  public static from (encodedOriginalDidDocument: string, didMethodName: string, hashAlgorithmAsMultihashCode: number): IDocument | undefined {
    // Compute the hash of the DID Document in the create payload as the DID
    const did = Did.from(encodedOriginalDidDocument, didMethodName, hashAlgorithmAsMultihashCode);

    // Decode the encoded DID Document.
    const decodedJsonString = Encoder.decodeAsString(encodedOriginalDidDocument);
    const decodedDidDocument = JSON.parse(decodedJsonString);

    // Replace the placeholder DID with real DID before returning it.
    decodedDidDocument.id = did;

    // Return `undefined` if original DID Document is invalid.
    if (!Document.isObjectValidOriginalDocument(decodedDidDocument)) {
      return undefined;
    }

    return decodedDidDocument;
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

    // Verify each publicKey entry in array.
    for (let publicKeyEntry of originalDocument.publicKey) {
      // 'id' must be a fragment (starts with '#').
      if (!(publicKeyEntry.id as string).startsWith('#')) {
        return false;
      }
    }

    // Verify 'service' property if it exists.
    if (originalDocument.hasOwnProperty('service')) {

      // Verify each service entry in array.
      for (let serviceEntry of originalDocument.service) {
        const serviceEndpoint = serviceEntry.serviceEndpoint;

        // Verify required '@context' property.
        if (serviceEndpoint['@context'] !== 'schema.identity.foundation/hub') {
          return false;
        }

        // Verify required '@type' property.
        if (serviceEndpoint['@type'] !== 'UserServiceEndpoint') {
          return false;
        }

        // 'instance' property is required and must be an array that is not empty.
        if (!Array.isArray(serviceEndpoint.instance) ||
            (serviceEndpoint.instance as object[]).length === 0) {
          return false;
        }

        // Verify each instance entry in array.
        for (let instanceEntry of serviceEndpoint.instance) {
          // 'id' must be string type.
          if (typeof instanceEntry !== 'string') {
            return false;
          }
        }
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

    // Verify 'publicKey' property if it exists.
    if (didDocument.hasOwnProperty('publicKey')) {
      // Verify each publicKey entry in array.
      for (let publicKeyEntry of didDocument.publicKey) {
        // 'id' must be string type.
        if (typeof publicKeyEntry.id !== 'string') {
          return false;
        }

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
        // 'id' is required and must be string type.
        if (typeof serviceEntry.id !== 'string') {
          return false;
        }

        // 'type' is required and must be string type.
        if (typeof serviceEntry.type !== 'string') {
          return false;
        }

        // 'serviceEndpoint' is required.
        if (serviceEntry.serviceEndpoint === undefined) {
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
  public static getPublicKey (didDocument: IDocument, keyId: string): DidPublicKey | undefined {
    for (let i = 0; i < didDocument.publicKey.length; i++) {
      const publicKey = didDocument.publicKey[i];

      if (publicKey.id && publicKey.id.endsWith(keyId)) {
        return publicKey;
      }
    }

    return undefined;
  }
}
