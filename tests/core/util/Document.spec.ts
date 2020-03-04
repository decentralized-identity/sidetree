import Document from '../../../lib/core/versions/latest/Document';

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
          usage: 'recovery',
          publicKeyHex: '034ee0f670fc96bb75e8b89c068a1665007a41c98513d6a911b6137e2d16f1d300'
        },
        {
          id: '#key2',
          type: 'Secp256k1VerificationKey2018',
          usage: 'signing',
          publicKeyHex: '034ee0f670fc96bb75e8b89c068a1665007a41c98513d6a911b6137e2d16f1d300'
        },
        {
          id: '#key3',
          type: 'Secp256k1VerificationKey2018',
          usage: 'signing',
          publicKeyHex: '034ee0f670fc96bb75e8b89c068a1665007a41c98513d6a911b6137e2d16f1d300'
        }
      ],
      service: [
        {
          id: 'IdentityHub',
          type: 'IdentityHub',
          serviceEndpoint: {
            '@context': 'schema.identity.foundation/hub',
            '@type': 'UserServiceEndpoint',
            instances: [
              'did:sidetree:value0'
            ]
          }
        }
      ]
    };
  });

  describe('isValid()', () => {

    it('returns false if DID Document does not contain "id" but validation requires it.', async () => {
      const isDocumentValid = Document.isValid(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if DID Document contains "publicKey" but is not an array.', async () => {
      defaultOriginalDidDocument.publicKey = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the "id" property of "publicKey" property is not a string.', async () => {
      defaultOriginalDidDocument.publicKey[0].id = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the "type" property of "publicKey" property is not a string.', async () => {
      defaultOriginalDidDocument.publicKey[0].type = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false when document has multiple public keys with the same id', async () => {
      let checkValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(checkValid).toBeTruthy();

      defaultOriginalDidDocument.publicKey.push(defaultOriginalDidDocument.publicKey[0]);
      checkValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(checkValid).toBeFalsy();

    });

    it('returns false if the "service" property is not an array.', async () => {
      defaultOriginalDidDocument.service = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if document given is undefined.', async () => {
      const isDocumentValid = Document.isValid(undefined, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the "type" property of "service" property is not a string.', async () => {
      defaultOriginalDidDocument.service[0].type = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the "service" property exists but it does not have a "serviceEndpoint" property.', async () => {
      defaultOriginalDidDocument.service[0].serviceEndpoint = undefined;

      const isDocumentValid = Document.isValid(defaultOriginalDidDocument, false);
      expect(isDocumentValid).toBeFalsy();
    });
  });
});
