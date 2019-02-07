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
    // // Get the protocol version according to the transaction time to decide on the hashing algorithm used for the DID.
    // const protocol = getProtocol(transactionTime);

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
   * Verifies that the given object is a valid encoded DID Document that can be accepted by the Sidetree create operation.
   */
  public static async isValidOriginalDocument (encodedOriginalDocument: string, allowedMaxSizeInBytes?: number): Promise<boolean> {
    const originalDocumentBuffer = Encoder.decodeAsBuffer(encodedOriginalDocument);

    // Verify size of each operation does not exceed the maximum allowed limit.
    if (allowedMaxSizeInBytes !== undefined &&
      originalDocumentBuffer.length > allowedMaxSizeInBytes) {
      return false;
    }

    // Define the schema for the original document accepted by Sidetree.
    const documentSchema = Yup.object({
      '@context': Yup.string().required().oneOf(['https://w3id.org/did/v1']),
      // The public key array must contain at least 1 value.
      publicKey: Yup.array().required().ensure().max(1)
    });

    try {
      const originalDocument = JSON.parse(originalDocumentBuffer.toString());
      await documentSchema.validate(originalDocument);
    } catch {
      return false;
    }

    return true;
  }
}
