import DidState from '../../lib/core/models/DidState';
import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';
import PatchAction from '../../lib/core/versions/latest/PatchAction';
import PublicKeyPurpose from '../../lib/core/versions/latest/PublicKeyPurpose';
import SidetreeError from '../../lib/common/SidetreeError';
import JsObject from '../../lib/core/versions/latest/util/JsObject';

describe('DocumentComposer', async () => {

  describe('transformToExternalDocument', () => {
    it('should output the expected resolution result given key(s) across all purpose types.', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey'); // All purposes will be included by default.
      const [noPurposePublicKey] = await OperationGenerator.generateKeyPair('noPurposePublicKey', []);
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Authentication]);
      const document = {
        publicKeys: [anySigningPublicKey, authPublicKey, noPurposePublicKey]
      };
      const didState: DidState = {
        document,
        lastOperationTransactionNumber: 123,
        nextRecoveryCommitmentHash: 'anyCommitmentHash',
        nextUpdateCommitmentHash: 'anyCommitmentHash'
      };

      const published = true;
      const result = DocumentComposer.transformToExternalDocument(didState, 'did:method:suffix', published);

      expect(result['@context']).toEqual('https://www.w3.org/ns/did-resolution/v1');
      expect(result.methodMetadata).toEqual({
        published: true,
        recoveryCommitment: 'anyCommitmentHash',
        updateCommitment: 'anyCommitmentHash'
      });
      expect(result.didDocument).toEqual({
        id: 'did:method:suffix',
        '@context': ['https://www.w3.org/ns/did/v1', { '@base': 'did:method:suffix' }],
        service: undefined,
        verificationMethod: [
          {
            id: '#anySigningKey',
            controller: result.didDocument.id,
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: { kty: 'EC', crv: 'secp256k1', x: anySigningPublicKey.publicKeyJwk.x, y: anySigningPublicKey.publicKeyJwk.y }
          },
          {
            id: '#authPublicKey',
            controller: result.didDocument.id,
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: { kty: 'EC', crv: 'secp256k1', x: authPublicKey.publicKeyJwk.x, y: authPublicKey.publicKeyJwk.y }
          },
          {
            id: '#noPurposePublicKey',
            controller: result.didDocument.id,
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: { kty: 'EC', crv: 'secp256k1', x: noPurposePublicKey.publicKeyJwk.x, y: noPurposePublicKey.publicKeyJwk.y }
          }
        ],
        assertionMethod: ['did:method:suffix#anySigningKey'],
        authentication: [
          'did:method:suffix#anySigningKey',
          'did:method:suffix#authPublicKey'
        ],
        capabilityDelegation: ['did:method:suffix#anySigningKey'],
        capabilityInvocation: ['did:method:suffix#anySigningKey'],
        keyAgreement: ['did:method:suffix#anySigningKey']
      });
    });

    it('should output method metadata with the given `published` value.', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey'); // All purposes will be included by default.
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Authentication]);
      const document = {
        publicKeys: [anySigningPublicKey, authPublicKey]
      };
      const didState: DidState = {
        document,
        lastOperationTransactionNumber: 123,
        nextRecoveryCommitmentHash: 'anyCommitmentHash',
        nextUpdateCommitmentHash: 'anyCommitmentHash'
      };

      let published = false;
      let result = DocumentComposer.transformToExternalDocument(didState, 'did:method:suffix', published);
      expect(result.methodMetadata.published).toEqual(published);

      published = true;
      result = DocumentComposer.transformToExternalDocument(didState, 'did:method:suffix', published);
      expect(result.methodMetadata.published).toEqual(published);
    });

    it('should return status deactivated if next recovery commit hash is undefined', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey');
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Authentication]);
      const document = {
        publicKeys: [anySigningPublicKey, authPublicKey]
      };
      const didState: DidState = {
        document,
        lastOperationTransactionNumber: 123,
        nextRecoveryCommitmentHash: undefined,
        nextUpdateCommitmentHash: 'anyCommitmentHash'
      };

      const published = true;
      const result = DocumentComposer.transformToExternalDocument(didState, 'did:method:suffix', published);
      expect(result).toEqual({ status: 'deactivated' });
    });
  });

  describe('addServices', () => {
    it('should add expected services to document', () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', publicKeyJwk: 'any value' }]
      };

      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: 'someType',
          serviceEndpoint: 'someEndpoint'
        }]
      };

      DocumentComposer['addServices'](document, patch);

      expect(document.services).toEqual([{ id: 'someId', type: 'someType', serviceEndpoint: 'someEndpoint' }]);
    });
  });

  describe('removePublicKeys()', () => {
    it('should leave document unchanged if it does not have `publicKeys` property.', () => {
      const document: DocumentModel = {
        services: OperationGenerator.generateServices(['anyServiceId'])
      };
      const deepCopyOriginalDocument = JsObject.deepCopyObject(document);

      const patch = {
        action: PatchAction.RemovePublicKeys,
        ids: ['1', '3']
      };

      DocumentComposer['removePublicKeys'](document, patch);
      expect(document).toEqual(deepCopyOriginalDocument);
    });
  });

  describe('removeServices()', () => {
    it('should remove the expected elements from services', () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', publicKeyJwk: 'any value' }],
        services: [
          { id: '1', type: 't', serviceEndpoint: 'se' },
          { id: '2', type: 't', serviceEndpoint: 'se' },
          { id: '3', type: 't', serviceEndpoint: 'se' },
          { id: '4', type: 't', serviceEndpoint: 'se' }
        ]
      };

      const patch = {
        action: PatchAction.RemoveServices,
        ids: ['1', '3']
      };

      DocumentComposer['removeServices'](document, patch);

      const expected = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', publicKeyJwk: 'any value' }],
        services: [
          { id: '2', type: 't', serviceEndpoint: 'se' },
          { id: '4', type: 't', serviceEndpoint: 'se' }
        ]
      };

      expect(document).toEqual(expected);
    });

    it('should leave document unchanged if it does not have `services` property', () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', publicKeyJwk: 'any value' }]
      };
      const deepCopyOriginalDocument = JsObject.deepCopyObject(document);

      const patch = {
        action: PatchAction.RemoveServices,
        ids: ['1', '3']
      };

      DocumentComposer['removeServices'](document, patch);
      expect(document).toEqual(deepCopyOriginalDocument);
    });
  });

  describe('validateRemoveServicesPatch', () => {
    it('should throw error if a remove-services patch contains additional unknown property.', async () => {
      const patch = {
        extra: 'unknown value',
        action: PatchAction.RemoveServices,
        ids: 'not an array'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => DocumentComposer['validateRemoveServicesPatch'](patch),
        ErrorCode.DocumentComposerUnknownPropertyInRemoveServicesPatch
      );
    });

    it('should throw DocumentComposerPatchServiceIdsNotArray if ids is not an array', () => {
      const patch = {
        action: PatchAction.RemoveServices,
        ids: 'not an array'
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceIdsNotArray);
      expect(() => { DocumentComposer['validateRemoveServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerIdTooLong if an id is not a string', () => {
      const patch = {
        action: PatchAction.RemoveServices,
        ids: [1234]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { DocumentComposer['validateRemoveServicesPatch'](patch); }, ErrorCode.DocumentComposerIdNotString
      );
    });

    it('should throw DocumentComposerIdTooLong if an id is too long', () => {
      const patch = {
        action: PatchAction.RemoveServices,
        ids: ['super long super long super long super long super long super long super long super long super long']
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
      expect(() => { DocumentComposer['validateRemoveServicesPatch'](patch); }).toThrow(expectedError);
    });
  });

  describe('validateAddServicesPatch', () => {
    it('should detect missing error and throw', () => {
      const patch = {};
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should detect unknown error and throw', () => {
      const patch = {
        extra: 'unknown value',
        action: PatchAction.AddServices,
        services: 'not an array'
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerIdTooLong if id is too long', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'super long super long super long super long super long super long super long super long super long',
          type: undefined,
          serviceEndpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerServiceHasMissingOrUnknownProperty if service has unknown property', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          extra: 'property',
          id: 'someId',
          type: undefined,
          serviceEndpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceHasMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerServiceHasMissingOrUnknownProperty if `serviceEndpoint` is missing', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: undefined
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceHasMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceTypeNotString if type is not a string', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: undefined,
          serviceEndpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeNotString);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceTypeTooLong if type too long', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: '1234567890123456789012345678901234567890',
          serviceEndpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceTypeTooLong);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should allow an non-array object as `serviceEndpoint`.', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: 'someType',
          serviceEndpoint: { anyObject: '123' }
        }]
      };

      // Expecting this call to succeed without errors.
      DocumentComposer['validateAddServicesPatch'](patch);
    });

    it('should throw error if `serviceEndpoint` is an array.', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: 'someType',
          serviceEndpoint: []
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointCannotBeAnArray);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw error if `serviceEndpoint` has an invalid type.', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: 'someType',
          serviceEndpoint: 123 // Invalid serviceEndpoint type.
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointMustBeStringOrNonArrayObject);
      expect(() => { DocumentComposer['validateAddServicesPatch'](patch); }).toThrow(expectedError);
    });

    it('Should throw if `serviceEndpoint` is not valid URI.', () => {
      const patch = {
        action: PatchAction.AddServices,
        services: [{
          id: 'someId',
          type: 'someType',
          serviceEndpoint: 'http://' // Invalid URI.
        }]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => DocumentComposer['validateAddServicesPatch'](patch),
        ErrorCode.DocumentComposerPatchServiceEndpointStringNotValidUri
      );
    });
  });

  describe('validateDocumentPatches()', async () => {
    it('should throw error if `patches` is not an array.', async () => {
      const patches = 'shouldNotBeAString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerUpdateOperationDocumentPatchesNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if given `action` is unknown.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].action as string) = 'invalidAction';

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

    it('should throw error if an entry in `publicKey` in an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyUnknownProperty, 'Unexpected property, unknownProperty, in publicKey.');
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `id` of a public key in an add-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].publicKeys![0] as any).id = { invalidType: true };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { DocumentComposer.validateDocumentPatches(patches); }, ErrorCode.DocumentComposerIdNotString
      );
    });

    it('should throw error if the a secp256k1 public key in an add-public-keys patch is not specified in `publicKeyJwk` property.', async () => {
      const patches = generatePatchesForPublicKeys();

      // Simulate that `publicKeyJwk` is missing.
      delete (patches[0].publicKeys![0] as any).publicKeyJwk;

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => DocumentComposer.validateDocumentPatches(patches),
        ErrorCode.InputValidatorInputIsNotAnObject,
        'publicKeyJwk'
      );
    });

    it('should throw error if `type` of a public key is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();

      // Simulate that a `type` has an incorrect type.
      (patches[0].publicKeys![0] as any).type = 123;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrIncorrectType);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if a remove-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).unknownProperty = 'unknownProperty';

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => DocumentComposer.validateDocumentPatches(patches),
        ErrorCode.DocumentComposerUnknownPropertyInRemovePublicKeysPatch
      );
    });

    it('should throw error if `ids` in an remove-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).ids = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the entries in `ids` in a remove-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1].ids![0] as any) = { invalidType: true };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => DocumentComposer.validateDocumentPatches(patches),
        ErrorCode.DocumentComposerIdNotString
      );
    });

    it('should throw error if `services` in an add-services patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).services = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServicesNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the `services` entry in the add-services patch is not a valid DID.', async () => {
      const patches = generatePatchesForPublicKeys() as any;
      patches[2].services[0] = 111;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceHasMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });
  });

  describe('applyPatches()', async () => {
    it('should add a key even if no keys exist yet.', async () => {
      const document: DocumentModel = { };

      const newKey = { id: 'aNonRepeatingId', type: 'someType', publicKeyJwk: { } }
      const patches = [
        {
          action: PatchAction.AddPublicKeys,
          publicKeys: [newKey]
        }
      ];

      DocumentComposer.applyPatches(document, patches);

      expect(document.publicKeys).toEqual([newKey]);

    });

    it('should replace old state entirely if the patch action is a replace.', async () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'anyKeyId', type: 'someType', publicKeyJwk: 'any value' }],
        services: []
      };

      // A replace patch that will remove all public keys and add a service endpoint.
      const patches = [{
        action: PatchAction.Replace,
        document: {
          publicKeys: [],
          services: [
            {
              id: 'key1',
              type: 'URL',
              serviceEndpoint: 'https://ion.is.cool/'
            }
          ]
        }
      }];

      DocumentComposer.applyPatches(document, patches);

      expect(document.publicKeys?.length).toEqual(0);
      expect(document.services?.length).toEqual(1);
    });

    it('should replace old key with the same ID with new values.', async () => {
      const document: DocumentModel = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', publicKeyJwk: 'any value' }],
        services: []
      };

      const newKeys = [
        { id: 'aRepeatingId', type: 'newTypeValue', publicKeyJwk: 'any new value' },
        { id: 'aNonRepeatingId', type: 'someType', publicKeyJwk: 'any value' }
      ];
      const patches = [
        {
          action: PatchAction.AddPublicKeys,
          publicKeys: newKeys
        }
      ];

      DocumentComposer.applyPatches(document, patches);

      expect(document.publicKeys).toEqual(newKeys);
    });

    it('should throw if action is not a valid patch action', async () => {
      const document: DocumentModel = {
      };
      const patches = [
        {
          action: 'invalid action',
          publicKeys: [
            { id: 'aNonRepeatingId', type: 'someType' }
          ]
        }
      ];

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(() => {
        DocumentComposer.applyPatches(document, patches);
      }, ErrorCode.DocumentComposerApplyPatchUnknownAction, 'Cannot apply invalid action: invalid action');
    });
  });

  describe('validateId()', async () => {
    it('should throw if ID given is not using characters from Base64URL character set.', async () => {
      const invalidId = 'AnInvalidIdWith#';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerIdNotUsingBase64UrlCharacterSet);
      expect(() => { (DocumentComposer as any).validateId(invalidId); }).toThrow(expectedError);
    });
  });

  describe('validateDocument()', async () => {
    it('should throw DocumentComposerDocumentMissing if document is undefined', () => {
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerDocumentMissing);
      expect(() => { DocumentComposer['validateDocument'](undefined); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServicesNotArray if `services` is not an array', () => {
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServicesNotArray);
      const document = {
        publicKeys: [{ id: 'aRepeatingId', type: 'someType', controller: 'someId' }],
        services: 'this is not an array'
      };
      spyOn(DocumentComposer as any, 'validatePublicKeys').and.returnValue(1);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document contains 2 services with the same ID.', async () => {
      const document: DocumentModel = {
        services: [
          {
            id: 'key1',
            type: 'URL',
            serviceEndpoint: 'https://ion.is.cool/'
          },
          {
            id: 'key1', // duplicate to cause failure
            type: 'URL',
            serviceEndpoint: 'https://ion.is.still.cool/'
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceIdNotUnique, 'Service id has to be unique');
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document contains 2 keys with the same ID.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: { a: 'unused a' },
            purposes: ['assertionMethod']
          },
          {
            id: 'key1', // Intentional duplicated key ID.
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: { b: 'unused b' },
            purposes: ['assertionMethod']
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should process as expected if document public key purposes is empty array.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {},
            purposes: []
          }
        ]
      };

      DocumentComposer['validateDocument'](document);
    });

    it('should process as expected if document public key purposes is undefined.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {}
          }
        ]
      };

      DocumentComposer['validateDocument'](document);
    });

    it('should throw if document public key purposes is not an array.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {},
            purposes: undefined
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposesIncorrectType);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public key purposes is bigger than expected length.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {},
            purposes: ['verificationMethod', 'verificationMethod']
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposesDuplicated);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public key contains invalid purpose.', async () => {
      const document = {
        publicKeys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {},
            purposes: ['verificationMethod', 'somethingInvalid']
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyInvalidPurpose);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document contains unknown property.', async () => {
      const document = {
        unknownProperty: 'any value'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => { DocumentComposer['validateDocument'](document); },
        ErrorCode.DocumentComposerUnknownPropertyInDocument
      );
    });
  });
});

/**
 * Generates a document patch containing an array of patches:
 * patches[0] is an add-public-keys
 * patches[1] is a remove-public-keys
 * patches[2] is an add-services
 */
function generatePatchesForPublicKeys () {
  return [
    {
      action: PatchAction.AddPublicKeys,
      publicKeys: [
        {
          id: 'keyX',
          type: 'EcdsaSecp256k1VerificationKey2019',
          publicKeyJwk: {
            kty: 'EC',
            crv: 'secp256k1',
            x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
            y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
          }
        }
      ]
    },
    {
      action: PatchAction.RemovePublicKeys,
      ids: ['keyY']
    },
    {
      action: PatchAction.AddServices,
      services: OperationGenerator.generateServices(['EiBQilmIz0H8818Cmp-38Fl1ao03yOjOh03rd9znsK2-8B'])
    }
  ];
}
