import * as Yup from 'yup';
import Did from './Did';
import Encoder from '../Encoder';
import { DidDocument } from '@decentralized-identity/did-common-typescript';

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

    // Verify that the document passes generic DID Document schema validation.
    const isValidGenericDidDocument = Document.isValid(originalDocument, false);
    if (!isValidGenericDidDocument) {
      return false;
    }

    // Verify additional Sidetree-specific rules for a valid original DID Document.
    const isValidOriginalDidDocument = Document.isObjectValidOriginalDocument(originalDocument);
    return isValidOriginalDidDocument;
  }

  /**
   * Verifies that the given JSON object is a valid encoded DID Document that can be accepted by the Sidetree create operation.
   */
  public static isObjectValidOriginalDocument (originalDocument: object): boolean {
    const isValidOriginalDidDocument = Document.getOriginalDidDocumentSchema().isValidSync(originalDocument);
    return isValidOriginalDidDocument;
  }

  /**
   * Verifies that the given object is a valid generic DID Document (not Sidetree specific).
   * @param requireDid Optional. Specifies if validation rules require the `id` property. Defaults to true if not given.
   */
  public static isValid (didDocument: object, requireId?: boolean): boolean {
    if (requireId === undefined) {
      requireId = true;
    }

    // Construct schema of `id` property.
    let idSchema = Yup.string();
    if (requireId === true) {
      idSchema = idSchema.required();
    } else {
      idSchema = idSchema.notRequired();
    }

    // Define the schema for the generic DID Document.
    const schema = Yup.object({
      '@context': Yup.string().required().oneOf(['https://w3id.org/did/v1']),
      id: idSchema,
      publicKey: Yup.array().notRequired()
    });

    const isValid = schema.isValidSync(didDocument);
    return isValid;
  }

  /**
   * Get Sidetree-specific schema required for a original DID Dcoument.
   */
  private static getOriginalDidDocumentSchema (): Yup.ObjectSchema<object> {
    // A public key must contain an `id` field and it must be a fragment (starts with '#').
    const publicKeySchema = Yup.object().shape({
      id: Yup.string().required().test('is-fragment', '${path} is not a fragment', keyId => (keyId as string).startsWith('#'))
    });

    const originalDidDocumentSchema = Yup.object({
      // The public key array must exist and must contain at least 1 public-key entry.
      publicKey: Yup.array(publicKeySchema).required().min(1)
    });

    return originalDidDocumentSchema;
  }
}
