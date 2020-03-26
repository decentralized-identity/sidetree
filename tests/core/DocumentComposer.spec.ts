import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DocumentComposer', async () => {
  describe('validateDocumentPatches()', async () => {
    it('should throw error if `patches` is not an array.', async () => {
      const patches = 'shouldNotBeAString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerUpdateOperationDocumentPatchesNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if given `action` is unknown.', async () => {
      const patches = generatePatchesForPublicKeys();
      patches[0].action = 'invalidAction';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownAction);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeysNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if an entry in `publicKeys` in an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `id` of a public key in an add-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).id = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdNotString);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if the a secp256k1 public key in an add-public-keys patch is not in `publicKeyHex` format.', async () => {
      const patches = generatePatchesForPublicKeys();
      delete (patches[0].publicKeys![0] as any).publicKeyHex;

      (patches[0].publicKeys![0] as any).publicKeyPem = 'DummyPemString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeySecp256k1NotCompressedHex);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if the type of a public key in an add-public-keys patch is not in the allowed list.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).type = 'unknownKeyType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrUnknown);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if a remove-public-keys patch contains additional unknown property..', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the public keys in a remove-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1].publicKeys![0] as any) = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if a add-service-endpoints patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `serviceType` in an add-service-endpoints patch is not in the allowed list.', async () => {
      const patches = generatePatchesForPublicKeys();
      patches[2].serviceType = 'unknownServiceType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeMissingOrUnknown);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `serviceEndpoints` in an add-service-endpoints patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).serviceEndpoints = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the service endpoints in the add-service-endpoints patch is not a valid DID.', async () => {
      const patches = generatePatchesForPublicKeys() as any;
      patches[2].serviceEndpoints[0] = 111;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointNotString);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });
  });

  describe('applyPatches()', async () => {
    it('should replace old key with the same ID with new values.', async () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', controller: 'someId' }],
        service: []
      };
      const patches = [
        {
          action: 'add-public-keys',
          publicKeys: [
            { id: 'aRepeatingId', type: 'newTypeValue' },
            { id: 'aNonRepeatingId', type: 'someType' }
          ]
        }
      ];

      const resultantDocument = DocumentComposer.applyPatches(document, patches);

      expect(resultantDocument.publicKeys).toEqual([
        { id: 'aRepeatingId', type: 'newTypeValue' },
        { id: 'aNonRepeatingId', type: 'someType' }
      ]);

    });
  });

  describe('validateDocument()', async () => {
    it('should throw if document contains 2 keys of with the same ID.', async () => {
      const document = {
        publicKeys: [
          {
            id: '#key1',
            type: 'RsaVerificationKey2018',
            publicKeyHex: 'anything'
          },
          {
            id: '#key1', // Intentional duplicated key ID.
            type: 'RsaVerificationKey2018',
            publicKeyPem: 'anything'
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      expect(() => { DocumentComposer.validateDocument(document); }).toThrow(expectedError);
    });

    it('should throw if document contains unknown property.', async () => {
      const document = {
        unknownProperty: 'any value'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
       async () => { DocumentComposer.validateDocument(document); },
       ErrorCode.DocumentComposerUnknownPropertyInDocument
      );
    });
  });
});

/**
 * Generates a document patch containing an array of patches:
 * patches[0] is an add-public-keys
 * patches[1] is a remove-public-keys
 * patches[2] is an add-service-endpoints
 */
function generatePatchesForPublicKeys () {
  return [
    {
      action: 'add-public-keys',
      publicKeys: [
        {
          id: '#keyX',
          type: 'Secp256k1VerificationKey2018',
          publicKeyHex: '0268ccc80007f82d49c2f2ee25a9dae856559330611f0a62356e59ec8cdb566e69'
        }
      ]
    },
    {
      action: 'remove-public-keys',
      publicKeys: ['#keyY']
    },
    {
      action: 'add-service-endpoints',
      serviceType: 'IdentityHub',
      serviceEndpoints: [
        'did:sidetree:EiBQilmIz0H8818Cmp-38Fl1ao03yOjOh03rd9znsK2-8B'
      ]
    }
  ];
}
