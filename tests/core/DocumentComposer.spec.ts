import DidState from '../../lib/core/models/DidState';
import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import OperationGenerator from '../generators/OperationGenerator';
import PublicKeyPurpose from '../../lib/core/versions/latest/PublicKeyPurpose';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DocumentComposer', async () => {

  describe('transformToExternalDocument', () => {
    it('should output the expected resolution result given key(s) across all purpose types.', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey');  // All purposes will be included by default.
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Auth]);
      const document = {
        public_keys: [anySigningPublicKey, authPublicKey]
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
        '@context': [ 'https://www.w3.org/ns/did/v1', { '@base': 'did:method:suffix' } ],
        service: undefined,
        publicKey: [{
          id: '#anySigningKey',
          controller: '',
          type: 'EcdsaSecp256k1VerificationKey2019',
          publicKeyJwk: { kty: 'EC', crv: 'secp256k1', x: anySigningPublicKey.jwk.x, y: anySigningPublicKey.jwk.y }
        }],
        authentication: [
          '#anySigningKey', // reference because it is a general purpose key
          {
            id: '#authPublicKey', // object here because it is an auth purpose only key
            controller: '',
            type: 'EcdsaSecp256k1VerificationKey2019',
            publicKeyJwk: {
              kty: 'EC', crv: 'secp256k1', x: authPublicKey.jwk.x, y: authPublicKey.jwk.y
            }
          }
        ]
      });
    });

    it('should output method metadata with the given `published` value.', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey');  // All purposes will be included by default.
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Auth]);
      const document = {
        public_keys: [anySigningPublicKey, authPublicKey]
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
      const [authPublicKey] = await OperationGenerator.generateKeyPair('authPublicKey', [PublicKeyPurpose.Auth]);
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

  describe('addServiceEndpoints', () => {
    it('should add expected service endpoints to document', () => {
      const document: DocumentModel = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', jwk: 'any value', purpose: [PublicKeyPurpose.General] }]
      };

      const patch = {
        action: 'add-service-endpoints',
        service_endpoints: [{
          id: 'someId',
          type: 'someType',
          endpoint: 'someEndpoint'}]
      };

      const result = DocumentComposer['addServiceEndpoints'](document, patch);

      expect(result.service_endpoints).toEqual([{ id: 'someId', type: 'someType', endpoint: 'someEndpoint' }]);
    });
  });

  describe('removeServiceEndpoints', () => {
    it('should remove the expected elements from service_endpoints', () => {
      const document: DocumentModel = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', jwk: 'any value', purpose: [PublicKeyPurpose.General] }],
        service_endpoints: [
          { id: '1', type: 't', endpoint: 'se' },
          { id: '2', type: 't', endpoint: 'se' },
          { id: '3', type: 't', endpoint: 'se' },
          { id: '4', type: 't', endpoint: 'se' }
        ]
      };

      const patch = {
        action: 'remove-service-endpoints',
        ids: ['1', '3']
      };

      const result = DocumentComposer['removeServiceEndpoints'](document, patch);

      const expected = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', jwk: 'any value', purpose: [PublicKeyPurpose.General] }],
        service_endpoints: [
          { id: '2', type: 't', endpoint: 'se' },
          { id: '4', type: 't', endpoint: 'se' }
        ]
      };

      expect(result).toEqual(expected);
    });

    it('should leave document unchanged if it does not have service endpoint property', () => {
      const document: DocumentModel = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', jwk: 'any value', purpose: [PublicKeyPurpose.General] }]
      };

      const patch = {
        action: 'remove-service-endpoints',
        ids: ['1', '3']
      };

      const result = DocumentComposer['removeServiceEndpoints'](document, patch);
      expect(result).toEqual(document);
    });
  });

  describe('validateRemoveServiceEndpointsPatch', () => {
    it('should detect missing error and throw', () => {
      const patch = {};
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateRemoveServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should detect unknown error and throw', () => {
      const patch = {
        extra: 'unknown value',
        action: 'remove-service-endpoints',
        ids: 'not an array'
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateRemoveServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointIdsNotArray if ids is not an array', () => {
      const patch = {
        action: 'remove-service-endpoints',
        ids: 'not an array'
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointIdsNotArray);
      expect(() => { DocumentComposer['validateRemoveServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerIdTooLong if an id is not a string', () => {
      const patch = {
        action: 'remove-service-endpoints',
        ids: [1234]
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { DocumentComposer['validateRemoveServiceEndpointsPatch'](patch); }, ErrorCode.DocumentComposerIdNotString
      );
    });

    it('should throw DocumentComposerIdTooLong if an id is too long', () => {
      const patch = {
        action: 'remove-service-endpoints',
        ids: ['super long super long super long super long super long super long super long super long super long']
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
      expect(() => { DocumentComposer['validateRemoveServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });
  });

  describe('validateAddServiceEndpointsPatch', () => {
    it('should detect missing error and throw', () => {
      const patch = {};
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should detect unknown error and throw', () => {
      const patch = {
        extra: 'unknown value',
        action: 'add-service-endpoints',
        service_endpoints: 'not an array'
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerIdTooLong if id is too long', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'super long super long super long super long super long super long super long super long super long',
          type: undefined,
          endpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerIdTooLong);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerServiceEndpointMissingOrUnknownProperty if service endpoint has unknown property', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          extra: 'property',
          id: 'someId',
          type: undefined,
          endpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceEndpointMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerServiceEndpointMissingOrUnknownProperty if endpoint is missing', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: undefined
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceEndpointMissingOrUnknownProperty);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointTypeNotString if type is not a string', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: undefined,
          endpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointTypeNotString);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointTypeTooLong if type too long', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: '1234567890123456789012345678901234567890',
          endpoint: 'something'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointTypeTooLong);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointServiceEndpointNotString if endpoint is not a string', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: 'someType',
          endpoint: undefined
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotString);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointServiceEndpointTooLong if endpoint is too long', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: 'someType',
          endpoint: 'https://www.1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678900.long'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointTooLong);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerPatchServiceEndpointServiceEndpointNotValidUrl if endpoint is not valid url', () => {
      const patch = {
        action: 'add-service-endpoint',
        service_endpoints: [{
          id: 'someId',
          type: 'someType',
          endpoint: 'this is not a valid url'
        }]
      };
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointServiceEndpointNotValidUrl);
      expect(() => { DocumentComposer['validateAddServiceEndpointsPatch'](patch); }).toThrow(expectedError);
    });
  });

  describe('validateDocument', () => {
    it('should throw DocumentComposerDocumentMissing if document is undefined', () => {
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerDocumentMissing);
      expect(() => { DocumentComposer['validateDocument'](undefined); }).toThrow(expectedError);
    });

    it('should throw DocumentComposerServiceNotArray if service is not an array', () => {
      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
      const document = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', controller: 'someId' }],
        service_endpoints: 'this is not an array'
      };
      spyOn(DocumentComposer as any, 'validatePublicKeys').and.returnValue(1);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
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

    it('should throw error if `public_keys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0] as any).public_keys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeysNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if an entry in `public_keys` in an add-public-keys patch contains additional unknown property.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].public_keys![0] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `id` of a public key in an add-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[0].public_keys![0] as any).id = { invalidType: true };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { DocumentComposer.validateDocumentPatches(patches); }, ErrorCode.DocumentComposerIdNotString
      );
    });

    it('should throw error if the a secp256k1 public key in an add-public-keys patch is not specified in `jwk` property.', async () => {
      const patches = generatePatchesForPublicKeys();

      // Simulate that `jwk` is missing.
      delete (patches[0].public_keys![0] as any).jwk;

      (patches[0].public_keys![0] as any).publicKeyPem = 'DummyPemString';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyJwkMissingOrIncorrectType);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `type` of a public key is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();

      // Simulate that a `type` has an incorrect type.
      (patches[0].public_keys![0] as any).type = 123;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyTypeMissingOrIncorrectType);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if a remove-public-keys patch contains additional unknown property..', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).unknownProperty = 'unknownProperty';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `public_keys` in an add-public-keys patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1] as any).public_keys = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the public keys in a remove-public-keys patch is not a string.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[1].public_keys![0] as any) = { invalidType: true };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchPublicKeyIdNotString);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if `service_endpoints` in an add-service-endpoints patch is not an array.', async () => {
      const patches = generatePatchesForPublicKeys();
      (patches[2] as any).service_endpoints = 'incorrectType';

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPatchServiceEndpointsNotArray);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });

    it('should throw error if any of the service endpoints in the add-service-endpoints patch is not a valid DID.', async () => {
      const patches = generatePatchesForPublicKeys() as any;
      patches[2].service_endpoints[0] = 111;

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerServiceEndpointMissingOrUnknownProperty);
      expect(() => { DocumentComposer.validateDocumentPatches(patches); }).toThrow(expectedError);
    });
  });

  describe('applyPatches()', async () => {
    it('should add a key even if no keys exist yet.', async () => {
      const document: DocumentModel = {
      };
      const patches = [
        {
          action: 'add-public-keys',
          public_keys: [
            { id: 'aNonRepeatingId', type: 'someType' }
          ]
        }
      ];

      const resultantDocument = DocumentComposer.applyPatches(document, patches);

      expect(resultantDocument.public_keys).toEqual([
        { id: 'aNonRepeatingId', type: 'someType' }
      ]);

    });

    it('should replace old key with the same ID with new values.', async () => {
      const document: DocumentModel = {
        public_keys: [{ id: 'aRepeatingId', type: 'someType', jwk: 'any value', purpose: [PublicKeyPurpose.General] }],
        service_endpoints: []
      };
      const patches = [
        {
          action: 'add-public-keys',
          public_keys: [
            { id: 'aRepeatingId', type: 'newTypeValue' },
            { id: 'aNonRepeatingId', type: 'someType' }
          ]
        }
      ];

      const resultantDocument = DocumentComposer.applyPatches(document, patches);

      expect(resultantDocument.public_keys).toEqual([
        { id: 'aRepeatingId', type: 'newTypeValue' },
        { id: 'aNonRepeatingId', type: 'someType' }
      ]);

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
    it('should throw if document contains 2 keys of with the same ID.', async () => {
      const document = {
        public_keys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: { a: 'unused a' },
            purpose: ['general']
          },
          {
            id: 'key1', // Intentional duplicated key ID.
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: { b: 'unused b' },
            purpose: ['general']
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyIdDuplicated);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public key purpose is empty array.', async () => {
      const document = {
        public_keys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: {},
            purpose: []
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposeMissingOrUnknown);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public_keys purpose is not an array.', async () => {
      const document = {
        public_keys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: {},
            purpose: undefined
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposeMissingOrUnknown);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public_keys is bigger than expected length.', async () => {
      const document = {
        public_keys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: {},
            purpose: ['general', 'general', 'general', 'general']
          }
        ]
      };

      const expectedError = new SidetreeError(ErrorCode.DocumentComposerPublicKeyPurposeExceedsMaxLength);
      expect(() => { DocumentComposer['validateDocument'](document); }).toThrow(expectedError);
    });

    it('should throw if document public_keys contains invalid purpose.', async () => {
      const document = {
        public_keys: [
          {
            id: 'key1',
            type: 'EcdsaSecp256k1VerificationKey2019',
            jwk: {},
            purpose: ['general', 'somethingInvalid']
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
 * patches[2] is an add-service-endpoints
 */
function generatePatchesForPublicKeys () {
  return [
    {
      action: 'add-public-keys',
      public_keys: [
        {
          id: 'keyX',
          type: 'EcdsaSecp256k1VerificationKey2019',
          jwk: {
            kty: 'EC',
            crv: 'secp256k1',
            x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
            y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
          },
          purpose: ['general']
        }
      ]
    },
    {
      action: 'remove-public-keys',
      public_keys: ['keyY']
    },
    {
      action: 'add-service-endpoints',
      service_endpoints: OperationGenerator.generateServiceEndpoints(['EiBQilmIz0H8818Cmp-38Fl1ao03yOjOh03rd9znsK2-8B'])
    }
  ];
}
