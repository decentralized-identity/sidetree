import * as afterCreate from '../vectors/resolution/afterCreate.json';
import * as afterDeactivate from '../vectors/resolution/afterDeactivate.json';
import * as afterRecover from '../vectors/resolution/afterRecover.json';
import * as afterUpdate from '../vectors/resolution/afterUpdate.json';
import * as generatedFixture from '../vectors/generated.json';

import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import Did from '../../lib/core/versions/latest/Did';
import DidState from '../../lib/core/models/DidState';
import Document from '../utils/Document';
import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import Fixture from '../utils/Fixture';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import PatchAction from '../../lib/core/versions/latest/PatchAction';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import Resolver from '../../lib/core/Resolver';

const OVERWRITE_FIXTURES = false;

describe('Resolver', () => {
  let resolver: Resolver;
  let operationProcessor: IOperationProcessor;
  let operationStore: IOperationStore;

  beforeEach(async () => {
    // Make sure the mock version manager always returns the same operation processor in the test.
    operationProcessor = new OperationProcessor();
    const versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);

    operationStore = new MockOperationStore();
    resolver = new Resolver(versionManager, operationStore);
  });

  describe('Resolving against test vectors', () => {
    it('should resolve create operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(generatedFixture.create.operationRequest));
      const createOperation = await CreateOperation.parse(operationBuffer);
      const didUniqueSuffix = createOperation.didUniqueSuffix;
      const anchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: didUniqueSuffix,
        operationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };
      await operationStore.insertOrReplace([anchoredOperationModel]);
      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const did = await Did.create(`did:sidetree:${didUniqueSuffix}`, 'sidetree');
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, did, published);
      Fixture.fixtureDriftHelper(resultingDocument, afterCreate, 'resolution/afterCreate.json', OVERWRITE_FIXTURES);
      expect(resultingDocument).toEqual(afterCreate);
    });

    it('should resolve DID that has an update operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(generatedFixture.create.operationRequest));
      const createOperation = await CreateOperation.parse(operationBuffer);
      const didUniqueSuffix = createOperation.didUniqueSuffix;
      const anchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: didUniqueSuffix,
        operationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };
      await operationStore.insertOrReplace([anchoredOperationModel]);

      const updateOperation = Buffer.from(JSON.stringify(generatedFixture.update.operationRequest));
      const anchoredUpdateOperation: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation,
        transactionTime: 2,
        transactionNumber: 2,
        operationIndex: 2
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation]);

      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const did = await Did.create(`did:sidetree:${didUniqueSuffix}`, 'sidetree');
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, did, published);
      Fixture.fixtureDriftHelper(resultingDocument, afterUpdate, 'resolution/afterUpdate.json', OVERWRITE_FIXTURES);
      expect(resultingDocument).toEqual(afterUpdate);
    });

    it('should resolve DID that has a recover operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(generatedFixture.create.operationRequest));
      const createOperation = await CreateOperation.parse(operationBuffer);
      const didUniqueSuffix = createOperation.didUniqueSuffix;
      const anchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: didUniqueSuffix,
        operationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };
      await operationStore.insertOrReplace([anchoredOperationModel]);

      const recoverOperationBuffer = Buffer.from(JSON.stringify(generatedFixture.recover.operationRequest));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 2, 2, 2);
      await operationStore.insertOrReplace([anchoredRecoverOperation]);

      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const did = await Did.create(`did:sidetree:${didUniqueSuffix}`, 'sidetree');
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, did, published);
      Fixture.fixtureDriftHelper(resultingDocument, afterRecover, 'resolution/afterRecover.json', OVERWRITE_FIXTURES);
      expect(resultingDocument).toEqual(afterRecover);
    });

    it('should resolve DID that has a deactivate operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(generatedFixture.create.operationRequest));
      const createOperation = await CreateOperation.parse(operationBuffer);
      const didUniqueSuffix = createOperation.didUniqueSuffix;
      const anchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: didUniqueSuffix,
        operationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };
      await operationStore.insertOrReplace([anchoredOperationModel]);

      const updateOperation = Buffer.from(JSON.stringify(generatedFixture.update.operationRequest));
      const anchoredUpdateOperation: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation,
        transactionTime: 2,
        transactionNumber: 2,
        operationIndex: 2
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation]);

      const recoverOperationBuffer = Buffer.from(JSON.stringify(generatedFixture.recover.operationRequest));
      const recoverOperation0 = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation0 = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation0, 3, 3, 3);
      await operationStore.insertOrReplace([anchoredRecoverOperation0]);

      const deactivateOperationBuffer = Buffer.from(JSON.stringify(generatedFixture.deactivate.operationRequest));
      const deactivateOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
      const anchoredDeactivateOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(deactivateOperation, 4, 4, 4);
      await operationStore.insertOrReplace([anchoredDeactivateOperation]);

      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const published = true;
      const did = await Did.create(`did:sidetree:${didUniqueSuffix}`, 'sidetree');
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, did, published);
      Fixture.fixtureDriftHelper(resultingDocument, afterDeactivate, 'resolution/afterDeactivate.json', OVERWRITE_FIXTURES);
      expect(resultingDocument).toEqual(afterDeactivate);
    });
  });

  describe('Recovery operation', () => {
    it('should apply correctly with updates that came before and after the recover operation.', async () => {
      // Generate key(s) and service(s) to be included in the DID Document.
      const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('signingKey');
      const services = OperationGenerator.generateServices(['dummyHubUri1']);

      // Create the initial create operation and insert it to the operation store.
      const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        services
      );
      const createOperation = await CreateOperation.parse(operationBuffer);
      const anchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: createOperation.didUniqueSuffix,
        operationBuffer,
        transactionNumber: 1,
        transactionTime: 1,
        operationIndex: 1
      };

      const didUniqueSuffix = createOperation.didUniqueSuffix;
      await operationStore.insertOrReplace([anchoredOperationModel]);

      // Create an update operation and insert it to the operation store.
      const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
      let [nextUpdateKey, nextUpdatePrivateKey] = await OperationGenerator.generateKeyPair(`next-update-key`);
      const updateOperation1PriorRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        signingPublicKey.publicKeyJwk,
        signingPrivateKey,
        additionalKey,
        Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.publicKeyJwk)
      );
      const updateOperation1BufferPriorRecovery = Buffer.from(JSON.stringify(updateOperation1PriorRecovery));
      const anchoredUpdateOperation1PriorRecovery: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation1BufferPriorRecovery,
        transactionTime: 2,
        transactionNumber: 2,
        operationIndex: 2
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation1PriorRecovery]);

      // Create another update operation and insert it to the operation store.
      const updatePayload2PriorRecovery = await OperationGenerator.generateUpdateOperationRequestForServices(
        didUniqueSuffix,
        nextUpdateKey.publicKeyJwk,
        nextUpdatePrivateKey,
        OperationGenerator.generateRandomHash(),
        'dummyUri2',
        []
      );
      const updateOperation2BufferPriorRecovery = Buffer.from(JSON.stringify(updatePayload2PriorRecovery));
      const anchoredUpdateOperation2PriorRecovery: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation2BufferPriorRecovery,
        transactionTime: 3,
        transactionNumber: 3,
        operationIndex: 3
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation2PriorRecovery]);

      // Sanity check to make sure the DID Document with update is resolved correctly.
      let didState = await resolver.resolve(didUniqueSuffix) as DidState;
      expect(didState.document.publicKeys.length).toEqual(2);
      expect(didState.document.services.length).toEqual(2);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey, newSigningPrivateKey] = await OperationGenerator.generateKeyPair('newSigningKey');
      const newServices = OperationGenerator.generateServices(['newDummyHubUri1']);

      // Create the recover operation and insert it to the operation store.
      const recoverOperationJson = await OperationGenerator.generateRecoverOperationRequest(
        didUniqueSuffix,
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        newServices,
        [newSigningPublicKey]
      );
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationJson));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 4, 4, 4);
      await operationStore.insertOrReplace([anchoredRecoverOperation]);

      // Create an update operation after the recover operation.
      const [newKey2ForUpdate1AfterRecovery] = await OperationGenerator.generateKeyPair(`newKey2Updte1PostRec`);
      [nextUpdateKey, nextUpdatePrivateKey] = await OperationGenerator.generateKeyPair(`next-update-key`);
      const updateOperation1AfterRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        newSigningPublicKey.publicKeyJwk,
        newSigningPrivateKey,
        newKey2ForUpdate1AfterRecovery,
        Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.publicKeyJwk)
      );
      const updateOperation1BufferAfterRecovery = Buffer.from(JSON.stringify(updateOperation1AfterRecovery));
      const anchoredUpdateOperation1AfterRecovery: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation1BufferAfterRecovery,
        transactionTime: 5,
        transactionNumber: 5,
        operationIndex: 5
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation1AfterRecovery]);

      // Create another update and insert it to the operation store.
      const updatePayload2AfterRecovery = await OperationGenerator.generateUpdateOperationRequestForServices(
        didUniqueSuffix,
        nextUpdateKey.publicKeyJwk,
        nextUpdatePrivateKey,
        OperationGenerator.generateRandomHash(),
        'newDummyHubUri2',
        ['newDummyHubUri1']
      );
      const updateOperation2BufferAfterRecovery = Buffer.from(JSON.stringify(updatePayload2AfterRecovery));
      const anchoredUpdateOperation2AfterRecovery: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation2BufferAfterRecovery,
        transactionTime: 6,
        transactionNumber: 6,
        operationIndex: 6
      };
      await operationStore.insertOrReplace([anchoredUpdateOperation2AfterRecovery]);

      // Validate recover operation getting applied.
      didState = await resolver.resolve(didUniqueSuffix) as DidState;

      const document = didState.document;
      expect(document).toBeDefined();
      const actualNewSigningPublicKey1 = Document.getPublicKey(document, 'newSigningKey');
      const actualNewSigningPublicKey2 = Document.getPublicKey(document, 'newKey2Updte1PostRec');
      expect(actualNewSigningPublicKey1).toBeDefined();
      expect(actualNewSigningPublicKey2).toBeDefined();
      expect(document.publicKeys.length).toEqual(2);
      expect(actualNewSigningPublicKey1!.publicKeyJwk).toEqual(newSigningPublicKey.publicKeyJwk);
      expect(actualNewSigningPublicKey2!.publicKeyJwk).toEqual(newKey2ForUpdate1AfterRecovery.publicKeyJwk);
      expect(document.services).toBeDefined();
      expect(document.services.length).toEqual(1);
      expect(document.services[0].serviceEndpoint).toBeDefined();
      expect(document.services[0].id).toEqual('newDummyHubUri2');
    });

  });

  describe('Hash algorithm change between operations', () => {
    it('should apply a subsequent update that uses a different hash algorithm correctly.', async () => {
      ProtocolParameters.hashAlgorithmsInMultihashCode = [18, 22];
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      await operationStore.insertOrReplace([createOperationData.anchoredOperationModel]);

      // Create an update operation with a DIFFERENT hash algorithm.
      const didSuffix = createOperationData.anchoredOperationModel.didUniqueSuffix;
      const multihashAlgorithmCodeToUse = 22; // SHA3
      const multihashAlgorithmForRevealValue = 18; // SHA2
      const updateOperationData = await OperationGenerator.generateUpdateOperation(
        didSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey,
        multihashAlgorithmCodeToUse,
        multihashAlgorithmForRevealValue
      );
      const anchoredUpdateOperation = await OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperationData.updateOperation, 2, 2, 2);
      await operationStore.insertOrReplace([anchoredUpdateOperation]);

      const didState = await resolver.resolve(didSuffix) as DidState;
      expect(didState.document.publicKeys.length).toEqual(2);
      expect(didState.document.publicKeys[1].id).toEqual(updateOperationData.additionalKeyId);
    });
  });

  describe('applyRecoverAndDeactivateOperations()', () => {
    it('should apply earliest recover operations if multiple operations are valid with same reveal.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);

      // Generate 3 anchored recover operations with the same reveal value but different anchored time.
      const recoveryOperation1Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey
      });
      const recoveryOperation2Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey
      });
      const recoveryOperation3Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey
      });
      const recoveryOperation1 = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoveryOperation1Data.recoverOperation, 2, 2, 2);
      const recoveryOperation2 = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoveryOperation2Data.recoverOperation, 3, 3, 3);
      const recoveryOperation3 = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoveryOperation3Data.recoverOperation, 4, 4, 4);

      // Intentionally insert earliest valid recover operation in between the other two operations to test sorting.
      const recoveryCommitValueToOperationMap = new Map<string, AnchoredOperationModel[]>();
      const nextRecoveryCommitment = createOperationData.createOperation.suffixData.recoveryCommitment;
      recoveryCommitValueToOperationMap.set(nextRecoveryCommitment, [recoveryOperation3, recoveryOperation1, recoveryOperation2]);

      const newDidState: DidState = await (resolver as any).applyRecoverAndDeactivateOperations(initialDidState, recoveryCommitValueToOperationMap);

      // Expecting the new state to contain info of the first recovery operation.
      expect(newDidState.lastOperationTransactionNumber).toEqual(2);
      expect(newDidState.nextRecoveryCommitmentHash).toEqual(recoveryOperation1Data.recoverOperation.signedData.recoveryCommitment);

      done();
    });

    it('should short circuit and return as soon as the end of the recovery/deactivate operation chain is reached.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);

      const recoveryOperation1Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey
      });

      const recoveryOperation1 = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoveryOperation1Data.recoverOperation, 2, 2, 2);

      const recoveryCommitValueToOperationMap = new Map<string, AnchoredOperationModel[]>();
      const nextRecoveryCommitment = createOperationData.createOperation.suffixData.recoveryCommitment;
      recoveryCommitValueToOperationMap.set(nextRecoveryCommitment, [recoveryOperation1]);

      spyOn(resolver as any, 'applyFirstValidOperation').and.returnValue(Promise.resolve(undefined));

      const newDidState: DidState = await (resolver as any).applyRecoverAndDeactivateOperations(initialDidState, recoveryCommitValueToOperationMap);

      expect(newDidState.lastOperationTransactionNumber).toEqual(1);
      expect(newDidState.nextRecoveryCommitmentHash).toEqual(createOperationData.operationRequest.suffixData.recoveryCommitment);
      done();
    });

    it('should not allow reuse of commit value - operation referencing itself.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);
      const didSuffix = createOperationData.createOperation.didUniqueSuffix;

      // Create the 1st recover operation.
      const documentFor1stRecovery = { };
      const recovery1Request = await OperationGenerator.createRecoverOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.recoveryPrivateKey,
        createOperationData.recoveryPublicKey, // Intentionally reuse the same recovery key causing a commit-reveal value loop.
        OperationGenerator.generateRandomHash(),
        documentFor1stRecovery
      );
      const anchoredRecovery1 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, recovery1Request, 2, 2, 2);

      const recoveryCommitValueToOperationMap: Map<string, AnchoredOperationModel[]> =
        await (resolver as any).constructCommitValueToOperationLookupMap([anchoredRecovery1]);

      const newDidState: DidState = await (resolver as any).applyRecoverAndDeactivateOperations(initialDidState, recoveryCommitValueToOperationMap);

      // Expecting the new state to contain info of the initial create operation only,
      // because the 2nd operation is invalid due to its reuse/circular reference of commitment hash.
      expect(newDidState.lastOperationTransactionNumber).toEqual(1);

      done();
    });

    it('should not allow reuse of commit value - operation referencing an earlier operation.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);
      const didSuffix = createOperationData.createOperation.didUniqueSuffix;

      // Create the 1st recover operation.
      const [publicKeyFor2ndRecovery, privateKeyFor2ndRecovery] = await Jwk.generateEs256kKeyPair();
      const recovery1Request = await OperationGenerator.createRecoverOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.recoveryPrivateKey,
        publicKeyFor2ndRecovery,
        OperationGenerator.generateRandomHash(), // Unused next update commitment.
        { }
      );
      const anchoredRecovery1 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, recovery1Request, 11, 11, 11);

      // Create the 2nd recovery.
      const recovery2Request = await OperationGenerator.createRecoverOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        privateKeyFor2ndRecovery,
        createOperationData.recoveryPublicKey, // Intentionally reuse the same recovery key in the create operation causing a commit-reveal value loop.
        OperationGenerator.generateRandomHash(), // Unused next update commitment.
        { }
      );
      const anchoredRecovery2 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, recovery2Request, 22, 22, 22);

      const commitValueToOperationMap: Map<string, AnchoredOperationModel[]> =
        await (resolver as any).constructCommitValueToOperationLookupMap([anchoredRecovery1, anchoredRecovery2]);

      const newDidState: DidState = await (resolver as any).applyRecoverAndDeactivateOperations(initialDidState, commitValueToOperationMap);

      // Expecting the new state to contain info of the first recover operation only,
      // because the 2nd recover operation is invalid due to its reuse/circular reference of commitment hash.
      expect(newDidState.lastOperationTransactionNumber).toEqual(11);

      done();
    });
  });

  describe('applyUpdateOperations()', () => {
    it('should apply earliest update operations if multiple operations are valid with same reveal.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);

      // Generate 3 anchored update operations with the same reveal value but different anchored time.
      const updateOperation1Data = await OperationGenerator.generateUpdateOperation(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey
      );
      const updateOperation2Data = await OperationGenerator.generateUpdateOperation(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey
      );
      const updateOperation3Data = await OperationGenerator.generateUpdateOperation(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey
      );
      const updateOperation1 = OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperation1Data.updateOperation, 2, 2, 2);
      const updateOperation2 = OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperation2Data.updateOperation, 3, 3, 3);
      const updateOperation3 = OperationGenerator.createAnchoredOperationModelFromOperationModel(updateOperation3Data.updateOperation, 4, 4, 4);

      // Intentionally insert earliest valid update operation in between the other two operations to test sorting.
      // Intentionally using the resolver's map construction method to test operations with the same reveal value are placed in the same array.
      const updateCommitValueToOperationMap: Map<string, AnchoredOperationModel[]> =
        await (resolver as any).constructCommitValueToOperationLookupMap([updateOperation3, updateOperation1, updateOperation2]);
      const nextUpdateCommitment = createOperationData.createOperation.delta!.updateCommitment;
      const updatesWithSameReveal = updateCommitValueToOperationMap.get(nextUpdateCommitment);
      expect(updatesWithSameReveal).toBeDefined();
      expect(updatesWithSameReveal!.length).toEqual(3);

      const newDidState: DidState = await (resolver as any).applyUpdateOperations(initialDidState, updateCommitValueToOperationMap);

      // Expecting the new state to contain info of the first update operation.
      expect(newDidState.lastOperationTransactionNumber).toEqual(2);
      expect(newDidState.nextUpdateCommitmentHash).toEqual(updateOperation1Data.updateOperation.delta!.updateCommitment);

      done();
    });

    it('should not allow reuse of commit value - operation referencing itself.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);
      const didSuffix = createOperationData.createOperation.didUniqueSuffix;

      // Create the 1st update.
      // Intentionally reuse the same update key causing a commit-reveal value loop.
      const commitmentHashFor2ndUpdate = Multihash.canonicalizeThenDoubleHashThenEncode(createOperationData.updatePublicKey);
      const patchesFor1stUpdate = [{
        action: PatchAction.Replace,
        document: {
          services: [{
            id: 'someService',
            type: 'someServiceType',
            serviceEndpoint: 'https://www.service1.com'
          }]
        }
      }];
      const update1Request = await OperationGenerator.createUpdateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey,
        commitmentHashFor2ndUpdate,
        patchesFor1stUpdate
      );
      const anchoredUpdate1 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, update1Request, 2, 2, 2);

      const updateCommitValueToOperationMap: Map<string, AnchoredOperationModel[]> =
        await (resolver as any).constructCommitValueToOperationLookupMap([anchoredUpdate1]);

      const newDidState: DidState = await (resolver as any).applyUpdateOperations(initialDidState, updateCommitValueToOperationMap);

      // Expecting the new state to contain info of the initial create operation only,
      // because the 2nd operation is invalid due to its reuse/circular reference of commitment hash.
      expect(newDidState.lastOperationTransactionNumber).toEqual(1);

      done();
    });

    it('should not allow reuse of commit value - operation referencing an earlier operation.', async (done) => {
      // Setting up initial DID state for the test.
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await operationProcessor.apply(createOperationData.anchoredOperationModel, undefined);
      const didSuffix = createOperationData.createOperation.didUniqueSuffix;

      // Create the 1st update.
      const [publicKeyFor2ndUpdate, privateKeyFor2ndUpdate] = await Jwk.generateEs256kKeyPair();
      const commitmentHashFor2ndUpdate = Multihash.canonicalizeThenDoubleHashThenEncode(publicKeyFor2ndUpdate);
      const patchesFor1stUpdate = [{
        action: PatchAction.Replace,
        document: {
          services: [{
            id: 'someService',
            type: 'someServiceType',
            serviceEndpoint: 'https://www.service1.com'
          }]
        }
      }];
      const update1Request = await OperationGenerator.createUpdateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey,
        commitmentHashFor2ndUpdate,
        patchesFor1stUpdate
      );
      const anchoredUpdate1 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, update1Request, 11, 11, 11);

      // Create the 2nd update.
      // Intentionally reuse the same update key causing a commit-reveal value loop.
      const commitmentHashFor3rdUpdate = Multihash.canonicalizeThenDoubleHashThenEncode(createOperationData.updatePublicKey);
      const patchesFor2ndUpdate = [{
        action: PatchAction.Replace,
        document: {
          services: [{
            id: 'someService',
            type: 'someServiceType',
            serviceEndpoint: 'https://www.service2.com'
          }]
        }
      }];
      const update2Request = await OperationGenerator.createUpdateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        publicKeyFor2ndUpdate,
        privateKeyFor2ndUpdate,
        commitmentHashFor3rdUpdate,
        patchesFor2ndUpdate
      );
      const anchoredUpdate2 = OperationGenerator.createAnchoredOperationModelFromRequest(didSuffix, update2Request, 22, 22, 22);

      const updateCommitValueToOperationMap: Map<string, AnchoredOperationModel[]> =
        await (resolver as any).constructCommitValueToOperationLookupMap([anchoredUpdate1, anchoredUpdate2]);

      const newDidState: DidState = await (resolver as any).applyUpdateOperations(initialDidState, updateCommitValueToOperationMap);

      // Expecting the new state to contain info of the first update operation only,
      // because the 2nd update operation is invalid due to its reuse/circular reference of commitment hash.
      expect(newDidState.lastOperationTransactionNumber).toEqual(11);

      done();
    });
  });

  describe('applyOperation()', () => {
    it('should not throw error even if an error is thrown internally.', async (done) => {
      spyOn(operationProcessor, 'apply').and.throwError('any error');

      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
      const initialDidState = await (resolver as any).applyOperation(createOperationData.anchoredOperationModel, undefined);

      // Expecting undefined to be returned instead of error being thrown.
      expect(initialDidState).toBeUndefined();
      done();
    });
  });

  describe('applyCreateOperation()', () => {
    it('should continue applying until did state is not undefined', async () => {
      let callCount = 0;

      // should return undefined the first time and an object the second time
      const applyOperationSpy = spyOn(resolver as any, 'applyOperation').and.callFake(() => {
        callCount++;
        if (callCount === 2) {
          return {
            document: {},
            nextRecoveryCommitmentHash: 'string',
            nextUpdateCommitmentHash: 'string',
            lastOperationTransactionNumber: 123
          };
        }
        return undefined;
      });

      await resolver['applyCreateOperation']([1 as any, 2 as any]);

      expect(applyOperationSpy).toHaveBeenCalledTimes(2);
    });
  });
});
