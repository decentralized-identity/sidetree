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
  firstUpdateRevealValue: string,
  numberOfUpdates: number,
  publicKeyId: string,
  privateKey: any): Promise<AnchoredOperationModel[]> {

  const ops = new Array(createOp);

  let updateRevealValue = firstUpdateRevealValue;
  for (let i = 0; i < numberOfUpdates; ++i) {
    const [nextUpdateRevealValue, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const patches = [
      {
        action: 'remove-service-endpoints',
        serviceEndpointIds: ['serviceEndpointId' + (i - 1)]
      },
      {
        action: 'add-service-endpoints',
        serviceEndpoints: OperationGenerator.generateServiceEndpoints(['serviceEndpointId' + i])
      }
    ];
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      updateRevealValue,
      nextUpdateCommitmentHash,
      patches,
      publicKeyId,
      privateKey
    );

    // Now that the update payload is created, update the update reveal for the next operation generation to use.
    updateRevealValue = nextUpdateRevealValue;

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
  expect(document!.serviceEndpoints![0].id).toEqual('serviceEndpointId' + (numberOfUpdates - 1));
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
  let firstUpdateRevealValue: string;
  let recoveryRevealValue: string;

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

    let recoveryCommitmentHash;
    let firstUpdateCommitmentHash;
    [recoveryRevealValue, recoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    [firstUpdateRevealValue, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey,
      recoveryCommitmentHash,
      firstUpdateCommitmentHash,
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
        publicKeys: [signingKeyId]
      }
    ];
    const nextUpdateCommitmentHash = 'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA';
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequest(
      didUniqueSuffix,
      firstUpdateRevealValue,
      nextUpdateCommitmentHash,
      patches,
      signingPublicKey.id,
      signingPrivateKey
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
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
    await operationStore.put(ops);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);
  });

  it('should correctly process updates in reverse order', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

    for (let i = numberOfUpdates ; i >= 0 ; --i) {
      await operationStore.put([ops[i]]);
    }
    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const numberOfUpdates = 4;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

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
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
    await operationStore.put(ops);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();
    console.log(didState!.document);
    validateDocumentAfterUpdates(didState!.document, numberOfUpdates);

    const deactivateOperationBuffer = await OperationGenerator.generateDeactivateOperationBuffer(didUniqueSuffix, recoveryRevealValue, recoveryPrivateKey);
    const deactivateOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      deactivateOperation, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const deactivatedDidState = await resolver.resolve(didUniqueSuffix);
    expect(deactivatedDidState).toBeDefined();
    expect(deactivatedDidState!.recoveryKey).toBeUndefined();
    expect(deactivatedDidState!.nextRecoveryCommitmentHash).toBeUndefined();
    expect(deactivatedDidState!.nextUpdateCommitmentHash).toBeUndefined();
    expect(deactivatedDidState!.lastOperationTransactionNumber).toEqual(numberOfUpdates + 1);
  });

  it('should ignore a deactivate operation of a non-existent did', async () => {
    const deactivateOperationBuffer = await OperationGenerator.generateDeactivateOperationBuffer(didUniqueSuffix, recoveryRevealValue, recoveryPrivateKey);
    const deactivateOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperation, 1, 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const didDocumentAfterDeactivate = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterDeactivate).toBeUndefined();
  });

  it('should ignore a deactivate operation with invalid signature', async () => {
    await operationStore.put([createOp]);

    const deactivateOperationBuffer = await OperationGenerator.generateDeactivateOperationBuffer(
      didUniqueSuffix, recoveryRevealValue, signingPrivateKey); // Intentionally signing with the wrong key.
    const deactivateOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
    const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperation, 1, 1, 0);
    await operationStore.put([anchoredDeactivateOperation]);

    const didState = await resolver.resolve(didUniqueSuffix);
    expect(didState).toBeDefined();

    const document = didState!.document;
    const signingKey = Document.getPublicKey(document, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should ignore updates to DID that is not created', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

    // elide i = 0, the create operation
    for (let i = 1 ; i < ops.length ; ++i) {
      await operationStore.put([ops[i]]);
    }

    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore update operation signed with an unresolvable key', async () => {
    await operationStore.put([createOp]);

    const [, anyNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const [anyPublicKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, firstUpdateRevealValue, anyPublicKey, anyNextUpdateCommitmentHash, 'nonExistentKey', signingPrivateKey
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
    const [, anyNextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const [anyPublicKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, firstUpdateRevealValue, anyPublicKey, anyNextUpdateCommitmentHash, signingKeyId, anyIncorrectSigningPrivateKey
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
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateRevealValue, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
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
    let nextRecoveryRevealValue: string;
    let nextUpdateRevealValue: string;

    // Create a DID before each test.
    beforeEach(async () => {
      // MUST reset the DID state back to `undefined` for each test.
      didState = undefined;

      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('signingKey');
      const serviceEndpoints = OperationGenerator.generateServiceEndpoints(['dummyHubUri']);

      // Create the initial create operation.
      let nextUpdateCommitmentHash;
      let nextRecoveryCommitmentHash;
      [nextUpdateRevealValue, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      [nextRecoveryRevealValue, nextRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        nextRecoveryCommitmentHash,
        nextUpdateCommitmentHash,
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
      expect(newDidState!.recoveryKey).toEqual(recoveryPublicKey);
    });

    describe('applyCreateOperation()', () => {
      it('should not apply the create operation if there a DID document is already found.', async () => {
        const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });

        const newDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();
        expect(newDidState!.recoveryKey).toEqual(recoveryPublicKey);
      });
    });

    describe('applyUpdateOperation()', () => {
      it('should not apply update operation if update RevealValue is invalid.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          'anIncorrectUpdateRevealValue',
          additionalKey,
          'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA',
          signingPublicKey.id,
          signingPrivateKey
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
        expect(newDidState!.document.publicKeys.length).toEqual(1);
      });

      it('should not apply update operation if signature is invalid.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          nextUpdateRevealValue,
          additionalKey,
          'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA',
          signingPublicKey.id,
          recoveryPrivateKey // NOTE: Using recovery private key to generate an invalid signautre.
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
        expect(newDidState!.document.publicKeys.length).toEqual(1);
      });

      it('should not apply update operation if specified public key is not found.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          nextUpdateRevealValue,
          additionalKey,
          'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA',
          'non-existent-signing-key',
          signingPrivateKey
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
        expect(newDidState!.document.publicKeys.length).toEqual(1);
      });
    });

    describe('applyRecoverOperation()', () => {
      it('should not apply if signature does not pass verification.', async () => {
        const operationData = await OperationGenerator.generateRecoverOperation({
          didUniqueSuffix,
          recoveryRevealValue: nextRecoveryRevealValue,
          recoveryPrivateKey: signingPrivateKey // Intentionally an incorrect recovery key.
        });
        const anchoredRecoverOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(operationData.recoverOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredRecoverOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);

        // Verify that the recovery key is still the same as prior to the application of the recover operation.
        expect(newDidState!.recoveryKey).toEqual(recoveryPublicKey);
      });

      it('should not apply if recovery RevealValue is invalid.', async () => {
        // Generate a recover operation payload.
        const operationData = await OperationGenerator.generateRecoverOperation(
          { didUniqueSuffix, recoveryRevealValue: 'invalidRevealValue', recoveryPrivateKey }
        );
        const anchoredRecoverOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(operationData.recoverOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredRecoverOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);

        // Verify that the recovery key is still the same as prior to the application of the recover operation.
        expect(newDidState!.recoveryKey).toEqual(recoveryPublicKey);
      });

      it('should apply successfully with document being { } if new document is in some unexpected format.', async () => {
        const document = 'unexpected document format';
        const [anyNewRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
        const [, anyNewRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
        const [, anyNewUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
        const recoverOperationRequest = await OperationGenerator.createRecoverOperationRequest(
          didUniqueSuffix,
          nextRecoveryRevealValue,
          recoveryPrivateKey,
          anyNewRecoveryPublicKey,
          anyNewRecoveryCommitmentHash,
          anyNewUpdateCommitmentHash,
          document
        );
        const recoverOperation = await RecoverOperation.parse(Buffer.from(JSON.stringify(recoverOperationRequest)));
        const anchoredRecoverOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredRecoverOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(2);
        expect(newDidState!.document).toEqual({ });

        expect(newDidState!.recoveryKey).toEqual(anyNewRecoveryPublicKey);
      });
    });

    describe('applyDeactivateOperation()', () => {
      it('should not apply if recovery RevealValue is invalid.', async () => {
        // Create deactivate operation payload.
        const deactivateOperationBuffer = await OperationGenerator.generateDeactivateOperationBuffer(
          didUniqueSuffix, 'invalideRecoveryRevealValue', recoveryPrivateKey
        );
        const deactivateOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
        const anchoredDeactivateOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperation, 2, 2, 2);

        const newDidState = await operationProcessor.apply(anchoredDeactivateOperationModel, didState);
        expect(newDidState!.lastOperationTransactionNumber).toEqual(1);
        expect(newDidState!.document).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(newDidState!.document.publicKeys.length).toEqual(1);
      });
    });
  });
});
