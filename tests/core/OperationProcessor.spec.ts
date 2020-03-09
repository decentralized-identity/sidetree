import BatchFile from '../../lib/core/versions/latest/BatchFile';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidDocument from '../../lib/core/versions/latest/DidDocument';
import DidDocumentModel from '../../lib/core/versions/latest/models/DidDocumentModel';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpoint from '../common/DidServiceEndpoint';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockCas from '../mocks/MockCas';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import NamedAnchoredOperationModel from '../../lib/core/models/NamedAnchoredOperationModel';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import Resolver from '../../lib/core/Resolver';
import RevokeOperation from '../../lib/core/versions/latest/RevokeOperation';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

async function addOperationsAsBatchFileToCas (
  operationBuffers: Buffer[],
  cas: ICas) {

  const batchBuffer = await BatchFile.fromOperationBuffers(operationBuffers);
  await cas.write(batchBuffer);
}

async function createUpdateSequence (
  didUniqueSuffix: string,
  createOp: NamedAnchoredOperationModel,
  firstUpdateOtp: string,
  cas: ICas,
  numberOfUpdates: number,
  publicKeyId: string,
  privateKey: any): Promise<NamedAnchoredOperationModel[]> {

  const ops = new Array(createOp);

  let updateOtp = firstUpdateOtp;
  for (let i = 0; i < numberOfUpdates; ++i) {
    const [nextUpdateOtp, nextUpdateOtpHash] = OperationGenerator.generateOtp();
    const documentPatch = [
      {
        action: 'remove-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: ['did:sidetree:value' + (i - 1)]
      },
      {
        action: 'add-service-endpoints',
        serviceType: 'IdentityHub',
        serviceEndpoints: ['did:sidetree:value' + i]
      }
    ];
    const updateOperationRequest = await OperationGenerator.generateUpdateOperationRequest(
      didUniqueSuffix,
      updateOtp,
      nextUpdateOtpHash,
      documentPatch,
      publicKeyId,
      privateKey
    );

    // Now that the update payload is created, update the update OTP for the next operation generation to use.
    updateOtp = nextUpdateOtp;

    const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    await addOperationsAsBatchFileToCas([operationBuffer], cas);

    const updateOp: NamedAnchoredOperationModel = {
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

function validateDidDocumentAfterUpdates (didDocument: DidDocumentModel | undefined, numberOfUpdates: number) {
  expect(didDocument).toBeDefined();
  expect(didDocument!.service![0].serviceEndpoint.instances[0]).toEqual('did:sidetree:value' + (numberOfUpdates - 1));
  validateDidDocumentPublicKeys(didDocument as DidDocumentModel);
}

function validateDidDocumentPublicKeys (didDocument: DidDocumentModel) {
  expect(didDocument.id).toBeDefined();
  const did = didDocument.id;

  for (let publicKey of didDocument.publicKey) {
    expect(publicKey.controller).toEqual(did);
  }
}

describe('OperationProcessor', async () => {
  const config = require('../json/config-test.json');
  let cas = new MockCas();
  let resolver: Resolver;
  let operationStore: IOperationStore;
  let versionManager: IVersionManager;
  let operationProcessor: IOperationProcessor;
  let createOp: NamedAnchoredOperationModel;
  let recoveryPublicKey: DidPublicKeyModel;
  let recoveryPrivateKey: string;
  let signingKeyId: string;
  let signingPublicKey: DidPublicKeyModel;
  let signingPrivateKey: string;
  let didUniqueSuffix: string;
  let firstUpdateOtp: string;
  let recoveryOtp: string;

  beforeEach(async () => {
    cas = new MockCas();
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config.didMethodName);
    versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);
    resolver = new Resolver(versionManager, operationStore);

    // Generate a unique key-pair used for each test.
    signingKeyId = '#signingKey';
    [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId, KeyUsage.signing);
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);

    let recoveryOtpHash;
    let firstUpdateOtpHash;
    [recoveryOtp, recoveryOtpHash] = OperationGenerator.generateOtp();
    [firstUpdateOtp, firstUpdateOtpHash] = OperationGenerator.generateOtp();

    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey,
      recoveryOtpHash,
      firstUpdateOtpHash,
      services
    );
    await addOperationsAsBatchFileToCas([createOperationBuffer], cas);
    const createOperation = await CreateOperation.parse(createOperationBuffer);
    createOp = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(createOperation, 0, 0, 0);
    didUniqueSuffix = createOp.didUniqueSuffix;
  });

  it('should return a DID Document for resolve(did) for a registered DID', async () => {
    await operationStore.put([createOp]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;

    expect(didDocument).toBeDefined();
    const signingKey = DidDocument.getPublicKey(didDocument, signingKeyId);
    expect(signingKey).toBeDefined();
    validateDidDocumentPublicKeys(didDocument);
  });

  it('should ignore a duplicate create operation', async () => {
    await operationStore.put([createOp]);

    // Insert a duplicate create op with a different transaction time.
    const duplicateOperation = await CreateOperation.parse(createOp.operationBuffer);
    const duplicateNamedAnchoredCreateOperationModel = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(duplicateOperation, 1, 1, 0);
    await operationStore.put([duplicateNamedAnchoredCreateOperationModel]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;

    expect(didDocument).toBeDefined();
    const signingKey = DidDocument.getPublicKey(didDocument, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should process update to remove a public key correctly', async () => {
    await operationStore.put([createOp]);

    const documentPatch = [
      {
        action: 'remove-public-keys',
        publicKeys: [signingKeyId]
      }
    ];
    const nextUpdateOtpHash = 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA';
    const updateOperationRequest = await OperationGenerator.generateUpdateOperationRequest(
      didUniqueSuffix,
      firstUpdateOtp,
      nextUpdateOtpHash,
      documentPatch,
      signingPublicKey.id,
      signingPrivateKey
    );

    const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    await addOperationsAsBatchFileToCas([operationBuffer], cas);

    const updateOp: NamedAnchoredOperationModel = {
      type: OperationType.Update,
      didUniqueSuffix,
      operationBuffer,
      transactionTime: 1,
      transactionNumber: 1,
      operationIndex: 0
    };
    await operationStore.put([updateOp]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;

    expect(didDocument).toBeDefined();
    const signingKey = DidDocument.getPublicKey(didDocument, signingKeyId);
    expect(signingKey).not.toBeDefined(); // if update above went through, new key would be added.
    validateDidDocumentPublicKeys(didDocument);
  });

  it('should process updates correctly', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
    await operationStore.put(ops);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
  });

  it('should correctly process updates in reverse order', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

    for (let i = numberOfUpdates ; i >= 0 ; --i) {
      await operationStore.put([ops[i]]);
    }
    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const numberOfUpdates = 4;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

    const numberOfOps = ops.length;
    let numberOfPermutations = getFactorial(numberOfOps);

    for (let i = 0 ; i < numberOfPermutations; ++i) {
      const permutation = getPermutation(numberOfOps, i);
      operationStore = new MockOperationStore();
      resolver = new Resolver(versionManager, operationStore);
      const permutedOps = permutation.map(i => ops[i]);
      await operationStore.put(permutedOps);
      const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
      validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);
    }
  });

  it('should return undefined for revoked did', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
    await operationStore.put(ops);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);

    const revokeOperationBuffer = await OperationGenerator.generateRevokeOperationBuffer(didUniqueSuffix, recoveryOtp, recoveryPrivateKey);
    const revokeOperation = await RevokeOperation.parse(revokeOperationBuffer);
    const anchoredRevokeOperation = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(
      revokeOperation, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationStore.put([anchoredRevokeOperation]);

    const didDocumentAfterRevoke = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterRevoke).toEqual({ status: 'revoked' });
  });

  it('should ignore a revoke operation of a non-existent did', async () => {
    const revokeOperationBuffer = await OperationGenerator.generateRevokeOperationBuffer(didUniqueSuffix, recoveryOtp, recoveryPrivateKey);
    const revokeOperation = await RevokeOperation.parse(revokeOperationBuffer);
    const anchoredRevokeOperation = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(revokeOperation, 1, 1, 0);
    await operationStore.put([anchoredRevokeOperation]);

    const didDocumentAfterRevoke = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterRevoke).toBeUndefined();
  });

  it('should ignore a revoke operation with invalid signature', async () => {
    await operationStore.put([createOp]);

    const revokeOperationBuffer = await OperationGenerator.generateRevokeOperationBuffer(
      didUniqueSuffix, recoveryOtp, signingPrivateKey); // Intentionally signing with the wrong key.
    const revokeOperation = await RevokeOperation.parse(revokeOperationBuffer);
    const anchoredRevokeOperation = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(revokeOperation, 1, 1, 0);
    await operationStore.put([anchoredRevokeOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
    expect(didDocument).toBeDefined();
    const signingKey = DidDocument.getPublicKey(didDocument, signingKeyId);
    expect(signingKey).toBeDefined();
  });

  it('should ignore updates to DID that is not created', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);

    // elide i = 0, the create operation
    for (let i = 1 ; i < ops.length ; ++i) {
      await operationStore.put([ops[i]]);
    }

    const didDocument = await resolver.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore update operation signed with an unresolvable key', async () => {
    await operationStore.put([createOp]);

    const [, anyNextUpdateOtpHash] = OperationGenerator.generateOtp();
    const anyPublicKeyHex = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, firstUpdateOtp, '#additionalKey', anyPublicKeyHex, anyNextUpdateOtpHash, '#nonExistentKey', signingPrivateKey
    );

    // Generate operation with an invalid key
    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    const updateOperation = await UpdateOperation.parse(updateOperationBuffer);
    const anchoredUpdateOperation = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(updateOperation, 1, 1, 0);
    await operationStore.put([anchoredUpdateOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;

    expect(didDocument).toBeDefined();
    const newKey = DidDocument.getPublicKey(didDocument, 'additionalKey');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should ignore update operation with an invalid signature', async () => {
    await operationStore.put([createOp]);

    const [, anyIncorrectSigningPrivateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.signing);
    const [, anyNextUpdateOtpHash] = OperationGenerator.generateOtp();
    const anyPublicKeyHex = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, firstUpdateOtp, '#additionalKey', anyPublicKeyHex, anyNextUpdateOtpHash, signingKeyId, anyIncorrectSigningPrivateKey
    );

    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    const updateOperation = await UpdateOperation.parse(updateOperationBuffer);
    const anchoredUpdateOperation = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(updateOperation, 1, 1, 0);
    await operationStore.put([anchoredUpdateOperation]);

    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;

    expect(didDocument).toBeDefined();
    const newKey = DidDocument.getPublicKey(didDocument, 'new-key');
    expect(newKey).not.toBeDefined(); // if update above went through, new key would be added.
  });

  it('should rollback all', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp, firstUpdateOtp, cas, numberOfUpdates, signingPublicKey.id, signingPrivateKey);
    await operationStore.put(ops);
    const didDocument = await resolver.resolve(didUniqueSuffix) as DidDocumentModel;
    validateDidDocumentAfterUpdates(didDocument, numberOfUpdates);

    // rollback
    await operationStore.delete();
    const didDocumentAfterRollback = await resolver.resolve(didUniqueSuffix);
    expect(didDocumentAfterRollback).toBeUndefined();
  });

  describe('apply()', () => {
    let recoveryPublicKey: DidPublicKeyModel;
    let recoveryPrivateKey: string;
    let signingPublicKey: DidPublicKeyModel;
    let signingPrivateKey: string;
    let namedAnchoredCreateOperationModel: NamedAnchoredOperationModel;
    let didDocumentReference: { didDocument: DidDocumentModel | undefined };
    let nextRecoveryOtp: string;
    let nextUpdateOtp: string;

    // Create a DID before each test.
    beforeEach(async () => {
      // MUST reset the DID document back to `undefined` for each test.
      didDocumentReference = { didDocument: undefined };

      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.recovery);
      [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#signingKey', KeyUsage.signing);
      const serviceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['dummyHubUri1', 'dummyHubUri2']);

      // Create the initial create operation.
      let nextUpdateOtpHash;
      let nextRecoveryOtpHash;
      [nextUpdateOtp, nextUpdateOtpHash] = OperationGenerator.generateOtp();
      [nextRecoveryOtp, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        nextRecoveryOtpHash,
        nextUpdateOtpHash,
        [serviceEndpoint]
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
      const result = await operationProcessor.apply(namedAnchoredCreateOperationModel, didDocumentReference);

      // Sanity check the create operation.
      expect(result).toBeTruthy();
      expect(didDocumentReference.didDocument).toBeDefined();
    });

    it('should continue if logging of an invalid operation application throws for unexpected reason', async () => {
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });

      spyOn(console, 'debug').and.throwError('An error message.');
      const result = await operationProcessor.apply(createOperationData.namedAnchoredOperationModel, didDocumentReference);
      expect(result.validOperation).toBeFalsy();
      expect(didDocumentReference.didDocument).toBeDefined();
      expect((didDocumentReference.didDocument as any).recoveryKey.publicKeyHex).toEqual(recoveryPublicKey.publicKeyHex!);
    });

    describe('applyCreateOperation()', () => {
      it('should not apply the create operation if there a DID document is already found.', async () => {
        const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 2, transactionNumber: 2, operationIndex: 2 });

        const result = await operationProcessor.apply(createOperationData.namedAnchoredOperationModel, didDocumentReference);
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();
        expect((didDocumentReference.didDocument as any).recoveryKey.publicKeyHex).toEqual(recoveryPublicKey.publicKeyHex!);
      });
    });

    describe('applyUpdateOperation()', () => {
      it('should not apply update operation if existing document is undefined.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          nextUpdateOtp,
          '#new-key1',
          '000000000000000000000000000000000000000000000000000000000000000000',
          'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
          signingPublicKey.id,
          signingPrivateKey
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: NamedAnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const result = await operationProcessor.apply(anchoredUpdateOperationModel, { didDocument: undefined });
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(didDocumentReference.didDocument!.publicKey.length).toEqual(1);
      });

      it('should not apply update operation if update OTP is invalid.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          'anIncorrectUpdateOtp',
          '#new-key1',
          '000000000000000000000000000000000000000000000000000000000000000000',
          'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
          signingPublicKey.id,
          signingPrivateKey
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: NamedAnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const result = await operationProcessor.apply(anchoredUpdateOperationModel, didDocumentReference);
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(didDocumentReference.didDocument!.publicKey.length).toEqual(1);
      });

      it('should not apply update operation if signature is invalid.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          nextUpdateOtp,
          '#new-key1',
          '000000000000000000000000000000000000000000000000000000000000000000',
          'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
          signingPublicKey.id,
          recoveryPrivateKey // NOTE: Using recovery private key to generate an invalid signautre.
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: NamedAnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const result = await operationProcessor.apply(anchoredUpdateOperationModel, didDocumentReference);
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The count of public signing keys should remain 1, not 2.
        expect(didDocumentReference.didDocument!.publicKey.length).toEqual(1);
      });

      it('should not apply update operation if specified public key is not found.', async () => {
        // Create an update using the create operation generated in `beforeEach()`.
        const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
          didUniqueSuffix,
          nextUpdateOtp,
          '#new-key1',
          '000000000000000000000000000000000000000000000000000000000000000000',
          'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
          '#non-existent-signing-key',
          signingPrivateKey
        );
        const operationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
        const anchoredUpdateOperationModel: NamedAnchoredOperationModel = {
          type: OperationType.Update,
          didUniqueSuffix,
          operationBuffer,
          transactionTime: 2,
          transactionNumber: 2,
          operationIndex: 2
        };

        const result = await operationProcessor.apply(anchoredUpdateOperationModel, didDocumentReference);
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(didDocumentReference.didDocument!.publicKey.length).toEqual(1);
      });
    });

    describe('applyRecoverOperation()', () => {
      it('should not apply if signature does not pass verification.', async () => {
        const operationData = await OperationGenerator.generateRecoverOperation({
          didUniqueSuffix,
          recoveryOtp: nextRecoveryOtp,
          recoveryPrivateKey: signingPrivateKey // Intentionally an incorrect recovery key.
        });
        const anchoredRecoverOperationModel = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(operationData.recoverOperation, 2, 2, 2);

        const recoveryResult = await operationProcessor.apply(anchoredRecoverOperationModel, didDocumentReference);
        expect(recoveryResult.validOperation).toBeFalsy();

        // Verify that the recovery key is still the same as prior to the application of the recover operation.
        expect(didDocumentReference.didDocument).toBeDefined();
        expect((didDocumentReference.didDocument as any).recoveryKey.publicKeyHex).toEqual(recoveryPublicKey.publicKeyHex!);
      });

      it('should not apply if recovery OTP is invalid.', async () => {
        // Generate a recover operation payload.
        const operationData = await OperationGenerator.generateRecoverOperation({ didUniqueSuffix, recoveryOtp: 'invalidOtpValue', recoveryPrivateKey });
        const anchoredRecoverOperationModel = OperationGenerator.createNamedAnchoredOperationModelFromOperationModel(operationData.recoverOperation, 2, 2, 2);

        const recoveryResult = await operationProcessor.apply(anchoredRecoverOperationModel, didDocumentReference);
        expect(recoveryResult.validOperation).toBeFalsy();

        // Verify that the recovery key is still the same as prior to the application of the recover operation.
        expect(didDocumentReference.didDocument).toBeDefined();
        expect((didDocumentReference.didDocument as any).recoveryKey.publicKeyHex).toEqual(recoveryPublicKey.publicKeyHex!);
      });

      it('should not apply if new Document does not pass verification.', async () => {
        const recoveryPayload = {
          type: OperationType.Recover,
          didUniqueSuffix,
          newDidDocument: { invalidDidDocument: 'invalidDidDocument' }
        };
        const anchoredRecoverOperationModel = await OperationGenerator.createNamedAnchoredOperationModel(
          didUniqueSuffix,
          OperationType.Recover,
          recoveryPayload,
          recoveryPublicKey.id,
          recoveryPrivateKey,
          2, 2, 2);

        const recoveryResult = await operationProcessor.apply(anchoredRecoverOperationModel, didDocumentReference);
        expect(recoveryResult.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The patched/resolved document is expected to contain the `controller` property.
        const expectedRecoveryPublicKey = Object.assign({}, recoveryPublicKey, { controller: config.didMethodName + didUniqueSuffix });
        expect((didDocumentReference.didDocument as any).recoveryKey.publicKeyHex).toEqual(expectedRecoveryPublicKey.publicKeyHex!);
      });
    });

    describe('applyRevokeOperation()', () => {
      it('should not apply if recovery OTP is invalid.', async () => {
        // Create revoke operation payload.
        const payload = {
          type: OperationType.Revoke,
          didUniqueSuffix,
          recoveryOtp: `invalideRecoveryOtp`
        };
        const anchoredUpdateOperationModel = await OperationGenerator.createNamedAnchoredOperationModel(
          didUniqueSuffix,
          OperationType.Revoke,
          payload,
          recoveryPublicKey.id,
          recoveryPrivateKey,
          2, 2, 2);

        const result = await operationProcessor.apply(anchoredUpdateOperationModel, didDocumentReference);
        expect(result.validOperation).toBeFalsy();
        expect(didDocumentReference.didDocument).toBeDefined();

        // The count of public keys should remain 1, not 2.
        expect(didDocumentReference.didDocument!.publicKey.length).toEqual(1);
      });
    });
  });
});
