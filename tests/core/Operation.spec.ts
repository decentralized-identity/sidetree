import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Operation from '../../lib/core/versions/latest/Operation';
import OperationGenerator from '../generators/OperationGenerator';
import { SidetreeError } from '../../lib/core/Error';

describe('Operation', async () => {
  // Load the DID Document template.

  let createRequest: any;

  beforeAll(async () => {
    // Generate a unique key-pair used for each test.
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairJwk('key1', KeyUsage.recovery, 'did:example:123');
    const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
    const [, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
    const [, nextUpdateOtpHash] = OperationGenerator.generateOtp();
    const createRequestBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      recoveryPrivateKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash,
      services
    );
    createRequest = JSON.parse(createRequestBuffer.toString());
  });

  it('should throw error if unknown property is found when parsing request.', async () => {
    createRequest.dummyProperty = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if more than one type of payload is found when parsing request.', async () => {
    createRequest.updatePayload = '123';
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });

  it('should throw error if signature is not found when parsing request.', async () => {
    delete createRequest.signature;
    const requestWithUnknownProperty = Buffer.from(JSON.stringify(createRequest));

    expect(() => { Operation.create(requestWithUnknownProperty); }).toThrowError();
  });

  describe('Update payload', async () => {
    it('should throw error if it contains an additioanl property.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload as any).additionalProperty = true;

      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrUnknownProperty));
    });

    it('should throw error if didUniqueSuffix is not a string.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload as any).didUniqueSuffix = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePayloadMissingOrInvalidDidUniqueSuffixType);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `patches` is not an array.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload as any).patches = 'shouldNotBeAString';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchesNotArray);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if given `action` is unknown.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      updatePayload.patches[0].action = 'invalidAction';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownAction);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if an add-public-keys patch contains additional unknown property.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[0] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeysNotArray);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if an entry in `publicKeys` in an add-public-keys patch contains additional unknown property.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[0].publicKeys![0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyMissingOrUnknownProperty);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `id` of a public key in an add-public-keys patch is not a string.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[0].publicKeys![0] as any).id = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyIdNotString);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if the public key includes the controller property', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      delete (updatePayload.patches[0].publicKeys![0] as any).type;
      (updatePayload.patches[0].publicKeys![0] as any).controller = 'somevalue';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyControllerNotAllowed);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if the a secp256k1 public key in an add-public-keys patch is not in `publicKeyHex` format.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      delete (updatePayload.patches[0].publicKeys![0] as any).publicKeyHex;

      (updatePayload.patches[0].publicKeys![0] as any).publicKeyPem = 'DummyPemString';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyHexMissingOrIncorrect);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if the type of a public key in an add-public-keys patch is not in the allowed list.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[0].publicKeys![0] as any).type = 'unknownKeyType';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyTypeMissingOrUnknown);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if a remove-public-keys patch contains additional unknown property..', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[1] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `publicKeys` in an add-public-keys patch is not an array.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[1] as any).publicKeys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeysNotArray);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if any of the public keys in a remove-public-keys patch is not a string.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[1].publicKeys![0] as any) = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchPublicKeyIdNotString);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if a add-service-endpoints patch contains additional unknown property.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[2] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchMissingOrUnknownProperty);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `serviceType` in an add-service-endpoints patch is not in the allowed list.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      updatePayload.patches[2].serviceType = 'unknownServiceType';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchServiceTypeMissingOrUnknown);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if `serviceEndpoints` in an add-service-endpoints patch is not an array.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys();
      (updatePayload.patches[2] as any).serviceEndpoints = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchServiceEndpointsNotArray);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    it('should throw error if any of the service endpoints in the add-service-endpoints patch is not a valid DID.', async () => {
      const updatePayload = generateUpdatePayloadForPublicKeys() as any;
      updatePayload.patches[2].serviceEndpoints[0] = 111;

      const expectedError = new SidetreeError(ErrorCode.OperationUpdatePatchServiceEndpointNotString);
      expect(() => { Operation.validateUpdatePayload(updatePayload); }).toThrow(expectedError);
    });

    describe('applyPatchesToDidDocument', async () => {
      it('should prevent the same id for multiple keys', async () => {
        const didDocument: DocumentModel = {
          '@context': 'someContext',
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

        Operation.applyPatchesToDidDocument(didDocument, patches);

        expect(didDocument.publicKey).toEqual([
          { id: 'aRepeatingId', type: 'someType', usage: 'some usage', controller: 'someId' },
          { id: 'aNonRepeatingId', type: 'someType', usage: 'some usage', controller: 'someId' }
        ]);

      });
    });

  });
});

/**
 * Generates an update payload with the following patch:
 * patches[0] is an add-public-keys
 * patches[1] is a remove-public-keys
 * patches[2] is an add-service-endpoints
 */
function generateUpdatePayloadForPublicKeys () {
  return {
    didUniqueSuffix: 'EiDk2RpPVuC4wNANUTn_4YXJczjzi10zLG1XE4AjkcGOLA',
    patches: [
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
    ],
    updateOtp: 'UnusedUpdateOneTimePassword',
    nextUpdateOtpHash: 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA'
  };
}
