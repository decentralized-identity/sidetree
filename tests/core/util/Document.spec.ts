import Document from '../../../lib/core/versions/latest/Document';
import Encoder from '../../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';

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
            instance: [
              'did:sidetree:value0'
            ]
          }
        }
      ]
    };
  });

  describe('from()', () => {
    it('should return undefined if the given document fails validation.', async () => {
      defaultOriginalDidDocument['@context'] = 'invalid-context';
      const originalDidDocumentJson = JSON.stringify(defaultOriginalDidDocument);
      const encodedOriginalDidDocument = Encoder.encode(originalDidDocumentJson);
      const documentModel = await Document.from(encodedOriginalDidDocument, 'did:sidetree', 18);

      expect(documentModel).toBeUndefined();
    });
  });

  describe('isEncodedStringValidOriginalDocument()', () => {

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

      const isDocumentValid = Document.isEncodedStringValidOriginalDocument(encodedOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });
  });

  describe('isObjectValidOriginalDocument()', () => {

    it('returns false if DID Document fails generic schema validation.', async () => {
      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeTruthy();
    });

    it('returns false if DID Document fails generic schema validation.', async () => {
      defaultOriginalDidDocument['@context'] = 'invalid-context';

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the DID Document does not contain public key array.', async () => {
      defaultOriginalDidDocument.publicKey = [];

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if a publick key in DID Document does not contain "usage" property.', async () => {
      delete defaultOriginalDidDocument.publicKey[0].usage;

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if DID Document does not contain a recovery key.', async () => {
      defaultOriginalDidDocument.publicKey.splice(1, 2); // Remove the first (recovery) key.

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if DID Document does not contain a signing key.', async () => {
      defaultOriginalDidDocument.publicKey.splice(0, 1); // Keep only the recovery key.

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if "serviceEndpoint" property does not contain the "@context" property.', async () => {
      defaultOriginalDidDocument.service[0].serviceEndpoint['@context'] = 'invalid-context';

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if "serviceEndpoint" property does not contain the "@type" property.', async () => {
      defaultOriginalDidDocument.service[0].serviceEndpoint['@type'] = 'invalid-context';

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if "instance" property of "serviceEndpoint" is empty.', async () => {
      defaultOriginalDidDocument.service[0].serviceEndpoint.instance = [];

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if an element in "instance" property of "serviceEndpoint" is not a string.', async () => {
      defaultOriginalDidDocument.service[0].serviceEndpoint.instance[0] = undefined;

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });

    it('returns false if the publickey element has the controller property set.', async () => {
      defaultOriginalDidDocument.publicKey[0].controller = 'somevalue';

      const isDocumentValid = Document.isObjectValidOriginalDocument(defaultOriginalDidDocument);
      expect(isDocumentValid).toBeFalsy();
    });
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

  describe('parseEncodedOriginalDidDocument()', () => {

    it('should throw if unable to decode input string.', async () => {
      spyOn(Encoder, 'decodeAsString').and.throwError('Some error');

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => Document.parseEncodedOriginalDidDocument('Unused string in test.'),
        ErrorCode.DocumentIncorretEncodedFormat
      );
    });

    it('should throw if decoded input string is not JSON.', async () => {
      const incorrectJsonString = 'value = { Not Json }';
      const inputString = Encoder.encode(incorrectJsonString);
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => Document.parseEncodedOriginalDidDocument(inputString),
        ErrorCode.DocumentNotJson
      );
    });

    it('should throw if decoded input string is not JSON.', async () => {
      const jsonString = JSON.stringify({ value: 'Not DID document' });
      const inputString = Encoder.encode(jsonString);
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => Document.parseEncodedOriginalDidDocument(inputString),
        ErrorCode.DocumentNotValidOriginalDocument
      );
    });
  });

  describe('isEncodedStringValidOriginalDocument ()', () => {

    it('should return false if given encoded string does not contain a JSON object', async () => {
      const incorrectJsonString = 'value = { Not Json }';
      const inputString = Encoder.encode(incorrectJsonString);
      const isValid = Document.isEncodedStringValidOriginalDocument(inputString);

      expect(isValid).toBeFalsy();
    });
  });
});
