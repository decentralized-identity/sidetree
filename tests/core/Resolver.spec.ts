import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Document from '../../lib/core/versions/latest/Document';
import DidState from '../../lib/core/models/DidState';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import Resolver from '../../lib/core/Resolver';

describe('Resolver', () => {
  let resolver: Resolver;
  let operationStore: IOperationStore;

  beforeEach(async () => {
    // Make sure the mock version manager always returns the same operation processor in the test.
    const operationProcessor = new OperationProcessor();
    const versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);

    operationStore = new MockOperationStore();
    resolver = new Resolver(versionManager, operationStore);
  });

  describe('Recovery operation', () => {
    it('should apply correctly with updates that came before and after the recover operation.', async () => {
      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey');
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#signingKey');
      const serviceEndpoints = OperationGenerator.generateServiceEndpoints(['dummyHubUri1']);
      const [firstRecoveryRevealValue, firstRecoveryCommitmentHash] = OperationGenerator.generateCommitRevealPair();
      const [firstUpdateRevealValue, firstUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();

      // Create the initial create operation and insert it to the operation store.
      const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        firstRecoveryCommitmentHash,
        firstUpdateCommitmentHash,
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
      const [update2RevealValuePriorToRecovery, update2CommitmentHashPriorToRecovery] = OperationGenerator.generateCommitRevealPair();
      const updateOperation1PriorRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        firstUpdateRevealValue,
        '#new-key1',
        '000000000000000000000000000000000000000000000000000000000000000000',
        update2CommitmentHashPriorToRecovery,
        signingPublicKey.id,
        signingPrivateKey
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
        update2RevealValuePriorToRecovery,
        'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA',
        'dummyUri2',
        [],
        signingPublicKey.id,
        signingPrivateKey
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
      expect(didState.document.publicKeys.length).toEqual(2);
      expect(didState.document.serviceEndpoints.length).toEqual(2);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#newRecoveryKey');
      const [newSigningPublicKey, newSigningPrivateKey] = await Cryptography.generateKeyPairHex('#newSigningKey');
      const newServiceEndpoints = OperationGenerator.generateServiceEndpoints(['newDummyHubUri1']);

      // Create the recover operation and insert it to the operation store.
      const [update1RevealValueAfterRecovery, update1CommitmentHashAfterRecovery] = OperationGenerator.generateCommitRevealPair();
      const [, recoveryCommitmentHashAfterRecovery] = OperationGenerator.generateCommitRevealPair();
      const recoverOperationJson = await OperationGenerator.generateRecoverOperationRequest(
        didUniqueSuffix,
        firstRecoveryRevealValue,
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        recoveryCommitmentHashAfterRecovery,
        update1CommitmentHashAfterRecovery,
        newServiceEndpoints
      );
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationJson));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 4, 4, 4);
      await operationStore.put([anchoredRecoverOperation]);

      // Create an update operation after the recover operation.
      const [update2RevealValueAfterRecovery, update2CommitmentHashAfterRecovery] = OperationGenerator.generateCommitRevealPair();
      const updateOperation1AfterRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        update1RevealValueAfterRecovery,
        '#newSigningKey2ByUpdate1AfterRecovery',
        '111111111111111111111111111111111111111111111111111111111111111111',
        update2CommitmentHashAfterRecovery,
        newSigningPublicKey.id,
        newSigningPrivateKey
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
        update2RevealValueAfterRecovery,
        'EiD_UnusedNextUpdateCommitmentHash_AAAAAAAAAAA',
        'newDummyHubUri2',
        ['newDummyHubUri1'],
        newSigningPublicKey.id,
        newSigningPrivateKey
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
      expect(document.publicKeys.length).toEqual(2);
      const actualNewSigningPublicKey1 = Document.getPublicKey(document, '#newSigningKey');
      const actualNewSigningPublicKey2 = Document.getPublicKey(document, '#newSigningKey2ByUpdate1AfterRecovery');
      expect(actualNewSigningPublicKey1).toBeDefined();
      expect(actualNewSigningPublicKey2).toBeDefined();
      expect(actualNewSigningPublicKey1!.publicKeyHex).toEqual(newSigningPublicKey.publicKeyHex);
      expect(actualNewSigningPublicKey2!.publicKeyHex).toEqual('111111111111111111111111111111111111111111111111111111111111111111');
      expect(document.serviceEndpoints).toBeDefined();
      expect(document.serviceEndpoints.length).toEqual(1);
      expect(document.serviceEndpoints[0].serviceEndpoint).toBeDefined();
      expect(document.serviceEndpoints[0].id).toEqual('newDummyHubUri2');
    });
  });
});
