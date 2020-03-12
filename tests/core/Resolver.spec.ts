import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidDocument from '../../lib/core/versions/latest/DidDocument';
import DidServiceEndpoint from '../common/DidServiceEndpoint';
import DocumentState from '../../lib/core/models/DocumentState';
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
      const serviceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['dummyHubUri1', 'dummyHubUri2']);
      const [firstRecoveryOtp, firstRecoveryOtpHash] = OperationGenerator.generateOtp();
      const [firstUpdateOtp, firstUpdateOtpHash] = OperationGenerator.generateOtp();

      // Create the initial create operation and insert it to the operation store.
      const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        firstRecoveryOtpHash,
        firstUpdateOtpHash,
        [serviceEndpoint]
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
      const [update2OtpPriorToRecovery, update2OtpHashPriorToRecovery] = OperationGenerator.generateOtp();
      const updateOperation1PriorRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        firstUpdateOtp,
        '#new-key1',
        '000000000000000000000000000000000000000000000000000000000000000000',
        update2OtpHashPriorToRecovery,
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
        update2OtpPriorToRecovery,
        'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
        ['dummyHubUri3'],
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
      let documentState = await resolver.resolve(didUniqueSuffix) as DocumentState;
      expect(documentState.document.publicKey.length).toEqual(2);
      expect(documentState.document.service[0].serviceEndpoint.instances.length).toEqual(3);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#newRecoveryKey');
      const [newSigningPublicKey, newSigningPrivateKey] = await Cryptography.generateKeyPairHex('#newSigningKey');
      const newServiceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['newDummyHubUri1', 'newDummyHubUri2']);

      // Create the recover operation and insert it to the operation store.
      const [update1OtpAfterRecovery, update1OtpHashAfterRecovery] = OperationGenerator.generateOtp();
      const [, recoveryOtpHashAfterRecovery] = OperationGenerator.generateOtp();
      const recoverOperationJson = await OperationGenerator.generateRecoverOperationRequest(
        didUniqueSuffix,
        firstRecoveryOtp,
        recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        recoveryOtpHashAfterRecovery,
        update1OtpHashAfterRecovery,
        [newServiceEndpoint]
      );
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationJson));
      const recoverOperation = await RecoverOperation.parse(recoverOperationBuffer);
      const anchoredRecoverOperation = OperationGenerator.createAnchoredOperationModelFromOperationModel(recoverOperation, 4, 4, 4);
      await operationStore.put([anchoredRecoverOperation]);

      // Create an update operation after the recover operation.
      const [update2OtpAfterRecovery, update2OtpHashAfterRecovery] = OperationGenerator.generateOtp();
      const updateOperation1AfterRecovery = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        update1OtpAfterRecovery,
        '#newSigningKey2ByUpdate1AfterRecovery',
        '111111111111111111111111111111111111111111111111111111111111111111',
        update2OtpHashAfterRecovery,
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
        update2OtpAfterRecovery,
        'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA',
        [],
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
      documentState = await resolver.resolve(didUniqueSuffix) as DocumentState;

      const didDocument = documentState.document;
      expect(didDocument).toBeDefined();
      expect(didDocument.publicKey.length).toEqual(2);
      const actualNewSigningPublicKey1 = DidDocument.getPublicKey(didDocument, '#newSigningKey');
      const actualNewSigningPublicKey2 = DidDocument.getPublicKey(didDocument, '#newSigningKey2ByUpdate1AfterRecovery');
      expect(actualNewSigningPublicKey1).toBeDefined();
      expect(actualNewSigningPublicKey2).toBeDefined();
      expect(actualNewSigningPublicKey1!.publicKeyHex).toEqual(newSigningPublicKey.publicKeyHex);
      expect(actualNewSigningPublicKey2!.publicKeyHex).toEqual('111111111111111111111111111111111111111111111111111111111111111111');
      expect(didDocument.service).toBeDefined();
      expect(didDocument.service.length).toEqual(1);
      expect(didDocument.service[0].serviceEndpoint).toBeDefined();
      expect(didDocument.service[0].serviceEndpoint.instances).toBeDefined();
      expect(didDocument.service[0].serviceEndpoint.instances.length).toEqual(1);
      expect(didDocument.service[0].serviceEndpoint.instances[0]).toEqual('newDummyHubUri2');
    });
  });
});
