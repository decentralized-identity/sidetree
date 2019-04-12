import Document from '../../lib/util/Document';
import Encoder from '../../lib/Encoder';

describe('Document', () => {

  let defaultOriginalDidDocument: any;

  beforeEach(() => {
    // Initialize a default DID Document object before each test.
    defaultOriginalDidDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: [
        {
          id: '#key1',
          type: 'Secp256k1VerificationKey2018',
          publicKeyHex: '034ee0f670fc96bb75e8b89c068a1665007a41c98513d6a911b6137e2d16f1d300'
        }
      ]
    };
  });

  it('should consider an original DID document invalid if it exceeds max allowed size.', async () => {
    const originalDidDocumentJson = JSON.stringify(defaultOriginalDidDocument);
    const encodedOriginalDidDocument = Encoder.encode(originalDidDocumentJson);

    // Max allowed size set to 10 bytes.
    const isDocumentValid = Document.isEncodedStringValidOriginalDocument(encodedOriginalDidDocument, 10);
    expect(isDocumentValid).toBeFalsy();
  });

  it('should consider an original DID document invalid if the public key id is not a fragment.', async () => {
    // Set the public key ID to be invalid.
    defaultOriginalDidDocument.publicKey[0].id = 'key1';
    const originalDidDocumentJson = JSON.stringify(defaultOriginalDidDocument);
    const encodedOriginalDidDocument = Encoder.encode(originalDidDocumentJson);

    // Max allowed size set to 10 bytes.
    const isDocumentValid = Document.isEncodedStringValidOriginalDocument(encodedOriginalDidDocument);
    expect(isDocumentValid).toBeFalsy();
  });
});
