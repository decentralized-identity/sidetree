import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import Document from '../../lib/core/versions/latest/Document';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import DidState from '../../lib/core/models/DidState';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import Resolver from '../../lib/core/Resolver';
import SidetreeError from '../../lib/common/SidetreeError';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

async function createUpdateSequence (
  didUniqueSuffix: string,
  createOp: AnchoredOperationModel,
  numberOfUpdates: number,
  privateKey: any): Promise<AnchoredOperationModel[]> {

  const ops = new Array(createOp);

  let currentUpdateKey = Jwk.getEs256kPublicKey(privateKey);
  let currentPrivateKey = privateKey;
  for (let i = 0; i < numberOfUpdates; ++i) {
    const [nextUpdateKey, nextPrivateKey] = await OperationGenerator.generateKeyPair('updateKey');
    const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.jwk);
    const patches = [
      {
        action: 'remove-service-endpoints',
        ids: ['serviceEndpointId' + (i - 1)]
      },
      {
        action: 'add-service-endpoints',
        service_endpoints: OperationGenerator.generateServiceEndpoints(['serviceEndpointId' + i])
      }
    ];
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      currentUpdateKey,
      currentPrivateKey,
      nextUpdateCommitmentHash,
      patches
    );

    // Now that the update payload is created, update the update reveal for the next operation generation to use.
    currentUpdateKey = nextUpdateKey.jwk;
    currentPrivateKey = nextPrivateKey;

    const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));

    const updateOp: AnchoredOperationModel = {
      type: OperationType.Update,
      didUniqueSuffix,
      operationBuffer,
      transactionTime: i + 1,
      transactionNumber: i + 1,
      operationIndex: 0
    };

    ops.push(updateOp);
  }

  return ops;
}

function getFactorial (n: number): number {
  let factorial = 1;
  for (let i = 2 ; i <= n ; ++i) {
    factorial *= i;
  }
  return factorial;
}

// Return a permutation of a given size with a specified index among
// all possible permutations. For example, there are 5! = 120 permutations
// of size 5, so by passing index values 0..119 we can enumerate all
// permutations
function getPermutation (size: number, index: number): Array<number> {
  const permutation: Array<number> = [];

  for (let i = 0 ; i < size ; ++i) {
    permutation.push(i);
  }

  for (let i = 0 ; i < size ; ++i) {
    const j = i + Math.floor(index / getFactorial(size - i - 1));
    index = index % getFactorial(size - i - 1);

    const t = permutation[i];
    permutation[i] = permutation[j];
    permutation[j] = t;
  }

  return permutation;
}

function validateDocumentAfterUpdates (document: DocumentModel | undefined, numberOfUpdates: number) {
  expect(document).toBeDefined();
  expect(document!.service_endpoints![0].id).toEqual('serviceEndpointId' + (numberOfUpdates - 1));
}

describe('OperationProcessor', async () => {
  let resolver: Resolver;
  let operationStore: IOperationStore;
  let versionManager: IVersionManager;
  let operationProcessor: IOperationProcessor;
  let createOp: AnchoredOperationModel;
  let recoveryPublicKey: JwkEs256k;
  let recoveryPrivateKey: JwkEs256k;
  let signingKeyId: string;
  let signingPublicKey: PublicKeyModel;
  let signingPrivateKey: JwkEs256k;
  let didUniqueSuffix: string;

  beforeEach(async () => {
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor();
    versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);
    resolver = new Resolver(versionManager, operationStore);

    // Generate a unique key-pair used for each test.
    signingKeyId = 'signingKey';
    [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
    const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId0']);

    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey,
      services
    );

    const createOperation = await CreateOperation.parse(createOperationBuffer);
    createOp = OperationGenerator.createAnchoredOperationModelFromOperationModel(createOperation, 0, 0, 0);
    didUniqueSuffix = createOp.didUniqueSuffix;
  });

  it('should return a DID Document for resolve(did) for a registered DID', async () => {
    await operationStore.put([createOp]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const signingKey = Document.getPublicKey(document, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should ignore a duplicate create operation', async () => {
    await operationStore.put([createOp]);

    // Insert a duplicate create op with a different transaction time.
    const duplicateOperation = await CreateOperation.parse(createOp.operationBuffer);
    const duplicateNamedAnchoredCreateOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(duplicateOperation, 1, 1, 0);
    await operationStore.put([duplicateNamedAnchoredCreateOperationModel]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const signingKey = Document.getPublicKey(document, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should process update to remove a public key correctly', async () => {
    await operationStore.put([createOp]);

    const patches = [
      {
        action: 'remove-public-keys',
        public_keys: [signingKeyId]
      }
    ];
    const nextUpdateCommitmentHash = 'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA';
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      signingPublicKey.jwk,
      signingPrivateKey,
      nextUpdateCommitmentHash,
      patches
    );

    const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));

    const updateOp: AnchoredOperationModel = {
      type: OperationType.Update,
      didUniqueSuffix,
      operationBuffer,
      transactionTime: 1,
      transactionNumber: 1,
      operationIndex: 0
    };
    await operationStore.put([updateOp]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const signingKey = Document.getPublicKey(document, signingKeyId);
    expect(signingKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should process updates correctly', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);
    await operationStore.put(ops);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);
  });

  it('should correctly process updates in reverse order', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);

    for (let i = numberOfUpdates ; i >= 0 ; --i) {
      await operationStore.put([ops[i]]);
    }
    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const numberOfUpdates = 4;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);

    const numberOfOps = ops.length;
    let numberOfPermutations = getFactorial(numberOfOps);

    for (let i = 0 ; i < numberOfPermutations; ++i) {
      const permutation = getPermutation(numberOfOps, i);
      operationStore = new MockOperationStore();
      resolver = new Resolver(versionManager, operationStore);
      const permutedOps = permutation.map(i => ops[i]);
      await operationStore.put(permutedOps);
      const didState = await resolver.resolve(didUniqueSuffix);
      expect(didState).toBeDefined();
      validateDocumentAfterUpdates(didState!.document, numberOfUpdates);
    }
  });

  it('should process deactivate operation correctly.', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);
    await operationStore.put(ops);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    console.log(didState!.document);
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);

    const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didUniqueSuffix, recoveryPrivateKey);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      deactivateOperationData.deactivateOperation, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const deactivatedDidState = await resolver.resolve(didUniqueSuffix);
    expect(deactivatedDidState).toBeDefined();
    expect(deactivatedDidState!.nextRecoveryCommitmentHash).toBeUndefined();
    expect(deactivatedDidState!.nextUpdateCommitmentHash).toBeUndefined();
    expect(deactivatedDidState!.lastOperationTransactionNumber).toEqual(numberOfUpdates + 1);
  });

  it('should ignore a deactivate operation of a non-existent did', async () => {
    const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didUniqueSuffix, recoveryPrivateKey);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperationData.deactivateOperation, 1, 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const didDocumentAfterDeactivate = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterDeactivate).toBeUndefined();
  });

  it('should ignore a deactivate operation with invalid signature', async () => {
    await operationStore.put([createOp]);

    // Intentionally signing with signing (wrong) key.
    const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didUniqueSuffix, signingPrivateKey);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperationData.deactivateOperation, 1, 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const signingKey = Document.getPublicKey(document, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should ignore updates to DID that is not created', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);

    // elide i = 0, the create operation
    for (let i = 1 ; i < ops.length ; ++i) {
      await operationStore.put([ops[i]]);
    }

    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore update operation with the incorrect updateKey', async () => {
    await operationStore.put([createOp]);

    const [anyPublicKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
    const [invalidKey] = await OperationGenerator.generateKeyPair('invalidKey');
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, invalidKey.jwk, signingPrivateKey, anyPublicKey, OperationGenerator.generateRandomHash()
    );

    // Generate operation with an invalid key
    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    const updateOperation = await UpdateOperation.parse(updateOperationBuffer);
    const anchoredUpdateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperation, 1, 1, 0);
    await operationStore.put([anchoredUpdateOperation]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const newKey = Document.getPublicKey(document, 'additionalKey');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should ignore update operation with an invalid signature', async () => {
    await operationStore.put([createOp]);

    const [, anyIncorrectSigningPrivateKey] = await OperationGenerator.generateKeyPair('key1');
    const [anyPublicKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, signingPublicKey.jwk, anyIncorrectSigningPrivateKey, anyPublicKey, OperationGenerator.generateRandomHash()
    );

    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    const updateOperation = await UpdateOperation.parse(updateOperationBuffer);
    const anchoredUpdateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperation, 1, 1, 0);
    await operationStore.put([anchoredUpdateOperation]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const newKey = Document.getPublicKey(document, 'new-key');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should resolve as undefined if all operation of a DID is rolled back.', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, numberOfUpdates, signingPrivateKey);
    await operationStore.put(ops);
    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);

    // rollback
    await operationStore.delete();
    const didDocumentAfterRollback = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterRollback).toBeUndefined();
  });

  describe('apply()', () => {
    let recoveryPublicKey: JwkEs256k;
    let recoveryPrivateKey: JwkEs256k;
    let signingPublicKey: PublicKeyModel;
    let signingPrivateKey: JwkEs256k;
    let namedAnchoredCreateOperationModel: AnchoredOperationModel;
    let didState: DidState | undefined;
    let nextRecoveryCommitmentHash: string;

    // Create a DID before each test.
    beforeEach(async () => {
      // MUST reset the DID state back to `undefined` for each test.
      didState = undefined;

      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('signingKey');
      nextRecoveryCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(recoveryPublicKey);
      const serviceEndpoints = OperationGenerator.generateServiceEndpoints(['dummyHubUri']);

      // Create the initial create operation.
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        serviceEndpoints
      );
      const createOperation = await CreateOperation.parse(createOperationBuffer);
      namedAnchoredCreateOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: createOperation.didUniqueSuffix,
        operationBuffer: createOperationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };

      // Apply the initial create operation.
      didState = await operationProcessor.apply(namedAnchoredCreateOperationModel, didState);

      // Sanity check the create operation.
      expect(didState).toBeDefined();
      expect(didState!.document).toBeDefined();
    });

    it('should return `undefined` if operation of unknown type is given.', async () => {
      // Create a non-create operation.
      const anyDid = OperationGenerator.generateRandomHash();
      const [, anyRecoveryPrivateKey] = await OperationGenerator.generateKeyPair('anyRecoveryKey');
      const deactivateOperationData = await OperationGenerator.createDeactivateOperation(anyDid, anyRecoveryPrivateKey);
      const anchoredDeactivateOperation
        = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperationData.deactivateOperation, 1, 1, 1);

      const newDidState = await operationProcessor.apply(anchoredDeactivateOperation, undefined);

      expect(newDidState).toBeUndefined();
    });

    it('should throw if operation of unknown type is given.', async () => {
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;

      (anchoredOperationModel.type as any) = 'UnknownType'; // Intentionally setting type to be an unknown type.

      await expectAsync(operationProcessor.apply(createOperationData.anchoredOperationModel, didState))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationProcessorUnknownOperationType));
    });

    it('should continue if logging of an invalid operation application throws for unexpected reason', async () => {
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });

      spyOn(console, 'debug').and.throwError('An error message.');
      const newDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, didState);
      expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
      expect(newDidState!.document).toBeDefined();
      expect(newDidState!.nextRecoveryCommitmentHash).toEqual(nextRecoveryCommitmentHash);
    });

    describe('applyCreateOperation()', () => {
      it('should not apply the create operation if a DID state already exists.', async () => {
        const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });

        const newDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();
        expect(newDidState!.nextRecoveryCommitmentHash).toEqual(nextRecoveryCommitmentHash);
      });
    });

    describe('applyUpdateOperation()', () => {
      it('should not apply update operation if update key and commitment are not pairs.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          (await Jwk.generateEs256kKeyPair())[0], // this is a random bad key
          signingPrivateKey,
          additionalKey,
          OperationGenerator.generateRandomHash()
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: AnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const newDidState = await operationProcessor.apply(anchoredUpdateOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(newDidState!.document.public_keys.length).toEqual(1);
      });

      it('should not apply update operation if signature is invalid.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          signingPublicKey.jwk,
          recoveryPrivateKey, // NOTE: Using recovery private key to generate an invalid signautre.
          additionalKey,
          OperationGenerator.generateRandomHash()
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: AnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const newDidState = await operationProcessor.apply(anchoredUpdateOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();

        // The count of public signing keys should remain 1, not 2.
        expect(newDidState!.document.public_keys.length).toEqual(1);
      });

      it('should not apply update operation if updateKey is invalid', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const [invalidUpdateKey] = await OperationGenerator.generateKeyPair('invalid');
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          invalidUpdateKey.jwk,
          signingPrivateKey,
          additionalKey,
          OperationGenerator.generateRandomHash()
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: AnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const newDidState = await operationProcessor.apply(anchoredUpdateOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(newDidState!.document.public_keys.length).toEqual(1);
      });
    });

    describe('applyRecoverOperation()', () => {
      it('should not apply if recovery key hash is invalid.', async () => {
        const operationData = await OperationGenerator.generateRecoverOperation({
          didUniqueSuffix,
          recoveryPrivateKey: signingPrivateKey // Intentionally an incorrect recovery key.
        });
        const anchoredRecoverOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(operationData.recoverOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredRecoverOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);

        // Verify that the recovery commitment is still the same as prior to the application of the recover operation.
        expect(newDidState!.nextRecoveryCommitmentHash).toEqual(nextRecoveryCommitmentHash);
      });

      it('should still apply successfully with resultant document being { } if new document is in some unexpected format.', async () => {
        const document = 'unexpected document format';
        const [anyNewRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
        const recoverOperationRequest = await OperationGenerator.createRecoverOperationRequest(
          didUniqueSuffix,
          recoveryPrivateKey,
          anyNewRecoveryPublicKey,
          'anyNewUpdateCommitmentHash',
          document
        );
        const recoverOperation = await RecoverOperation.parse(Buffer.from(JSON.stringify(recoverOperationRequest)));
        const anchoredRecoverOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredRecoverOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(2);
        expect(newDidState!.document).toEqual({ });

        const expectedNewRecoveryCommitment = Multihash.canonicalizeThenDoubleHashThenEncode(anyNewRecoveryPublicKey);
        expect(newDidState!.nextRecoveryCommitmentHash).toEqual(expectedNewRecoveryCommitment);
      });
    });

    describe('applyDeactivateOperation()', () => {
      it('should not apply if calculated recovery key hash is invalid.', async () => {
        // Creating and signing a deactivate operation using an invalid/incorrect recovery key.
        const [, anyIncorrectRecoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
        const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didUniqueSuffix, anyIncorrectRecoveryPrivateKey);
        const deactivateOperation = await DeactivateOperation.parse(deactivateOperationData.operationBuffer);
        const anchoredDeactivateOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredDeactivateOperationModel, didState);

        // Expecting resulting DID state to still be the same as prior to attempting to apply the invalid deactivate operation.
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();
        expect(newDidState!.document.public_keys.length).toEqual(1);
        expect(newDidState!.nextUpdateCommitmentHash).toEqual(didState!.nextUpdateCommitmentHash);
      });
    });
  });

  describe('getMultihashRevealValue()', () => {
    it('should throw if a create operation is given.', async () => {
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });

      await expectAsync(operationProcessor.getMultihashRevealValue(createOperationData.anchoredOperationModel))
        .toBeRejectedWith(new SidetreeError(ErrorCode.OperationProcessorCreateOperationDoesNotHaveRevealValue));
    });
  });
});
