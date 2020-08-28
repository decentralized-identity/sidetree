import * as createFixture from '../fixtures/create/create.json';
import * as createResultingDocument from '../fixtures/create/resultingDocument.json';
import * as deactivateFixtureCreate from '../fixtures/deactivate/create.json';
import * as deactivateFixture from '../fixtures/deactivate/deactivate.json';
import * as deactivateResultingDocument from '../fixtures/deactivate/resultingDocument.json';
import * as recoverFixtureCreate from '../fixtures/recover/create.json';
import * as recoverFixture from '../fixtures/recover/recover.json';
import * as recoverResultingDocument from '../fixtures/recover/resultingDocument.json';
import * as updateFixtureCreate from '../fixtures/update/create.json';
import * as updateFixture from '../fixtures/update/update.json';
import * as updateResultingDocument from '../fixtures/update/resultingDocument.json';

import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import DocumentComposer from '../../lib/core/versions/latest/DocumentComposer';
import Document from '../../lib/core/versions/latest/Document';
import DidState from '../../lib/core/models/DidState';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import Resolver from '../../lib/core/Resolver';

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
      const operationBuffer = Buffer.from(JSON.stringify(createFixture));
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
      await operationStore.put([anchoredOperationModel]);

      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, `did:sidetree:${didUniqueSuffix}`, published);
      expect(resultingDocument).toEqual(createResultingDocument);
    });

    it('should resolve DID that has an update operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(updateFixtureCreate));
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
      await operationStore.put([anchoredOperationModel]);

      const updateOperation = Buffer.from(JSON.stringify(updateFixture));
      const anchoredUpdateOperation: AnchoredOperationModel = {
        type: OperationType.Update,
        didUniqueSuffix,
        operationBuffer: updateOperation,
        transactionTime: 2,
        transactionNumber: 2,
        operationIndex: 2
      };
      await operationStore.put([anchoredUpdateOperation]);

      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, `did:sidetree:${didUniqueSuffix}`, published);
      expect(resultingDocument).toEqual(updateResultingDocument);
    });

    it('should resolve DID that has a recover operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(recoverFixtureCreate));
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
      await operationStore.put([anchoredOperationModel]);

      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverFixture));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 2, 2, 2);
      await operationStore.put([anchoredRecoverOperation]);

      const published = true;
      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, `did:sidetree:${didUniqueSuffix}`, published);
      expect(resultingDocument).toEqual(recoverResultingDocument);
    });

    it('should resolve DID that has a deactivate operation', async () => {
      const operationBuffer = Buffer.from(JSON.stringify(deactivateFixtureCreate));
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
      await operationStore.put([anchoredOperationModel]);

      const deactivateOperationBuffer = Buffer.from(JSON.stringify(deactivateFixture));
      const recoverOperation = await DeactivateOperation.parse(deactivateOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 2, 2, 2);
      await operationStore.put([anchoredRecoverOperation]);

      const didState = await resolver.resolve(didUniqueSuffix) as DidState;
      const published = true;
      const resultingDocument = DocumentComposer.transformToExternalDocument(didState, `did:sidetree:${didUniqueSuffix}`, published);
      expect(resultingDocument).toEqual(deactivateResultingDocument);
    });
  });

  describe('Recovery operation', () => {
    it('should apply correctly with updates that came before and after the recover operation.', async () => {
      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair('signingKey');
      const serviceEndpoints = OperationGenerator.generateServiceEndpoints(['dummyHubUri1']);

      // Create the initial create operation and insert it to the operation store.
      const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        serviceEndpoints
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
      await operationStore.put([anchoredOperationModel]);

      // Create an update operation and insert it to the operation store.
      const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
      let [nextUpdateKey, nextUpdatePrivateKey] = await OperationGenerator.generateKeyPair(`next-update-key`);
      const updateOperation1PriorRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        signingPublicKey.jwk,
        signingPrivateKey,
        additionalKey,
        Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.jwk)
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
      await operationStore.put([anchoredUpdateOperation1PriorRecovery]);

      // Create another update operation and insert it to the operation store.
      const updatePayload2PriorRecovery = await OperationGenerator.createUpdateOperationRequestForHubEndpoints(
        didUniqueSuffix,
        nextUpdateKey.jwk,
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
      await operationStore.put([anchoredUpdateOperation2PriorRecovery]);

      // Sanity check to make sure the DID Document with update is resolved correctly.
      let didState = await resolver.resolve(didUniqueSuffix) as DidState;
      expect(didState.document.public_keys.length).toEqual(2);
      expect(didState.document.service_endpoints.length).toEqual(2);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey, newSigningPrivateKey] = await OperationGenerator.generateKeyPair('newSigningKey');
      const newServiceEndpoints = OperationGenerator.generateServiceEndpoints(['newDummyHubUri1']);

      // Create the recover operation and insert it to the operation store.
      const recoverOperationJson = await OperationGenerator.generateRecoverOperationRequest(
        didUniqueSuffix,
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        newServiceEndpoints,
        [newSigningPublicKey]
      );
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationJson));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 4, 4, 4);
      await operationStore.put([anchoredRecoverOperation]);

      // Create an update operation after the recover operation.
      const [newKey2ForUpdate1AfterRecovery] = await OperationGenerator.generateKeyPair(`newKey2Updte1PostRec`);
      [nextUpdateKey, nextUpdatePrivateKey] = await OperationGenerator.generateKeyPair(`next-update-key`);
      const updateOperation1AfterRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        newSigningPublicKey.jwk,
        newSigningPrivateKey,
        newKey2ForUpdate1AfterRecovery,
        Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.jwk)
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
      await operationStore.put([anchoredUpdateOperation1AfterRecovery]);

      // Create another update and insert it to the operation store.
      const updatePayload2AfterRecovery = await OperationGenerator.createUpdateOperationRequestForHubEndpoints(
        didUniqueSuffix,
        nextUpdateKey.jwk,
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
      await operationStore.put([anchoredUpdateOperation2AfterRecovery]);

      // Validate recover operation getting applied.
      didState = await resolver.resolve(didUniqueSuffix) as DidState;

      const document = didState.document;
      expect(document).toBeDefined();
      const actualNewSigningPublicKey1 = Document.getPublicKey(document, 'newSigningKey');
      const actualNewSigningPublicKey2 = Document.getPublicKey(document, 'newKey2Updte1PostRec');
      expect(actualNewSigningPublicKey1).toBeDefined();
      expect(actualNewSigningPublicKey2).toBeDefined();
      expect(document.public_keys.length).toEqual(2);
      expect(actualNewSigningPublicKey1!.jwk).toEqual(newSigningPublicKey.jwk);
      expect(actualNewSigningPublicKey2!.jwk).toEqual(newKey2ForUpdate1AfterRecovery.jwk);
      expect(document.service_endpoints).toBeDefined();
      expect(document.service_endpoints.length).toEqual(1);
      expect(document.service_endpoints[0].endpoint).toBeDefined();
      expect(document.service_endpoints[0].id).toEqual('newDummyHubUri2');
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
        recoveryPrivateKey: createOperationData.recoveryPrivateKey });
      const recoveryOperation2Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey });
      const recoveryOperation3Data = await OperationGenerator.generateRecoverOperation({
        didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
        recoveryPrivateKey: createOperationData.recoveryPrivateKey });
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

      // Intentionally insert earliest valid recover operation in between the other two operations to test sorting.
      // Intentionally using the resolver's map construction method to test operations with the same reveal value are placed in the same array.
      const updateCommitValueToOperationMap: Map<string, AnchoredOperationModel[]>
        = await (resolver as any).constructCommitValueToOperationLookupMap([updateOperation3, updateOperation1, updateOperation2]);
      const nextUpdateCommitment = createOperationData.createOperation.delta!.updateCommitment;
      const updatesWithSameReveal = updateCommitValueToOperationMap.get(nextUpdateCommitment);
      expect(updatesWithSameReveal).toBeDefined();
      expect(updatesWithSameReveal!.length).toEqual(3);

      const newDidState: DidState = await (resolver as any).applyUpdateOperations(initialDidState, updateCommitValueToOperationMap);

      // Expecting the new state to contain info of the first recovery operation.
      expect(newDidState.lastOperationTransactionNumber).toEqual(2);
      expect(newDidState.nextUpdateCommitmentHash).toEqual(updateOperation1Data.updateOperation.delta!.updateCommitment);

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
});
