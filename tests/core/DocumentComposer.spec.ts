import DidDocumentModel from '../../lib/core/versions/latest/models/DidDocumentModel';
import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import SidetreeError from '../../lib/core/SidetreeError';

describe('DocumentComposer', async () => {
  describe('validateDocumentPatch()', async () => {
    it('should throw error if `patches` is not an array.', async () => {
      const patches = 'shouldNotBeAString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerUpdateOperationDocumentPatchNotArray);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if given `action` is unknown.', async () => {
      const patches = generatePatchesForPublicKeys();
      patches[0].action = 'invalidAction';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownAction);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeysNotArray);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if an entry in `publicKeys` in an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if `id` of a public key in an add-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).id = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if the public key in an add-public-keys patch is a declared as a recovery key.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).usage = KeyUsage.recovery;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyAddRecoveryKeyNotAllowed);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if the public key includes the controller property', async () => {
      const patches = generatePatchesForPublicKeys();
      delete (patches[0].publicKeys![0] as any).type;
      (patches[0].publicKeys![0] as any).controller = 'somevalue';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyControllerNotAllowed);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if the a secp256k1 public key in an add-public-keys patch is not in `publicKeyHex` format.', async () => {
      const patches = generatePatchesForPublicKeys();
      delete (patches[0].publicKeys![0] as any).publicKeyHex;

      (patches[0].publicKeys![0] as any).publicKeyPem = 'DummyPemString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyHexMissingOrIncorrect);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if the type of a public key in an add-public-keys patch is not in the allowed list.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).type = 'unknownKeyType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyTypeMissingOrUnknown);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if a remove-public-keys patch contains additional unknown property..', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeysNotArray);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the public keys in a remove-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1].publicKeys![0] as any) = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if a add-service-endpoints patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if `serviceType` in an add-service-endpoints patch is not in the allowed list.', async () => {
      const patches = generatePatchesForPublicKeys();
      patches[2].serviceType = 'unknownServiceType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeMissingOrUnknown);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if `serviceEndpoints` in an add-service-endpoints patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).serviceEndpoints = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the service endpoints in the add-service-endpoints patch is not a valid DID.', async () => {
      const patches = generatePatchesForPublicKeys() as any;
      patches[2].serviceEndpoints[0] = 111;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointNotString);
      expect(() => { DocumentComposer.validateDocumentPatch(patches); }).toThrow(expectedError);
    });
  });

  describe('applyPatchesToDidDocument()', async () => {
    it('should prevent the same id for multiple keys', async () => {
      const didDocument: DidDocumentModel = {
        '@context': 'https://www.w3.org/ns/did/v1',
        id: 'someId',
        publicKey: [{ id: 'aRepeatingId', type: 'someType', usage: 'some usage', controller: 'someId' }],
        service: []
      };
      const patches = [
        {
          action: 'add-public-keys',
          publicKeys: [
            { id: 'aRepeatingId', type: 'thisShouldNotShowUp', usage: 'thisShouldNotShowUp' },
            { id: 'aNonRepeatingId', type: 'someType', usage: 'some usage' }
          ]
        }
      ];

      (DocumentComposer as any).applyPatchesToDidDocument(didDocument, patches);

      expect(didDocument.publicKey).toEqual([
        { id: 'aRepeatingId', type: 'someType', usage: 'some usage', controller: 'someId' },
        { id: 'aNonRepeatingId', type: 'someType', usage: 'some usage', controller: 'someId' }
      ]);

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
          usage: 'signing',
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
