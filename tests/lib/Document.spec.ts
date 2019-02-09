import Document from '../../src/lib/Document';
import Encoder from '../../src/Encoder';

describe('Document', () => {
  it('should consider an original DID document invalid if it exceeds max allowed size.', async () => {

    const originalDidDocument = `{
      "@context": "https://w3id.org/did/v1",
      "publicKey": [
        {
            "id": "#key1",
            "type": "Secp256k1VerificationKey2018",
            "publicKeyHex": "034ee0f670fc96bb75e8b89c068a1665007a41c98513d6a911b6137e2d16f1d300"
        }
      ]
    }`;

    const encodedOriginalDidDocument = Encoder.encode(originalDidDocument);

    // Max allowed size set to 10 bytes.
    const isDocumentValid = Document.isEncodedStringValidOriginalDocument(encodedOriginalDidDocument, 10);
    expect(isDocumentValid).toBeFalsy();
  });
});
