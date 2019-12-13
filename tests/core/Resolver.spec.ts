import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidServiceEndpoint from '../common/DidServiceEndpoint';
import Document from '../../lib/core/versions/latest/Document';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import Resolver from '../../lib/core/Resolver';

describe('Resolver', () => {
  const config = require('../json/config-test.json');
  let resolver: Resolver;
  let operationStore: IOperationStore;

  beforeEach(async () => {
    // Make sure the mock version manager always returns the same operation processor in the test.
    const operationProcessor = new OperationProcessor(config.didMethodName);
    const versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);

    operationStore = new MockOperationStore();
    resolver = new Resolver(versionManager, operationStore);
  });

  describe('Recover operation', () => {
    it('should apply correctly with updates that came before and after the recover operation.', async () => {
      // Generate key(s) and service endpoint(s) to be included in the DID Document.
      const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.recovery);
      const [signingPublicKey, signingPrivateKey] = await Cryptography.generateKeyPairHex('#signingKey', KeyUsage.signing);
      const serviceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['dummyHubUri1', 'dummyHubUri2']);

      // Create the initial create operation and insert it to the operation store.
      const documentModel = Document.create([recoveryPublicKey, signingPublicKey], [serviceEndpoint]);
      const anchoredCreateOperation =
        await OperationGenerator.createAnchoredOperation(OperationType.Create, documentModel, recoveryPublicKey.id, recoveryPrivateKey, 1, 1, 1);
      const didUniqueSuffix = anchoredCreateOperation.didUniqueSuffix;
      await operationStore.put([anchoredCreateOperation]);

      // Create an update and insert it to the operation store.
      const updatePayloadPriorRecovery1 = OperationGenerator.createUpdatePayloadForAddingAKey(
        anchoredCreateOperation,
        '#new-key1',
        '000000000000000000000000000000000000000000000000000000000000000000'
      );
      const updateOperationPriorRecovery1 =
        await OperationGenerator.createAnchoredOperation(OperationType.Update, updatePayloadPriorRecovery1, signingPublicKey.id, signingPrivateKey, 2, 2, 2);
      await operationStore.put([updateOperationPriorRecovery1]);

      // Create another update and insert it to the operation store.
      const updatePayloadPriorRecovery2 = await OperationGenerator.createUpdatePayloadForHubEndpoints(didUniqueSuffix, ['dummyHubUri3'], []);
      const updateOperationPriorRecovery2 =
        await OperationGenerator.createAnchoredOperation(OperationType.Update, updatePayloadPriorRecovery2, signingPublicKey.id, signingPrivateKey, 3, 3, 3);
      await operationStore.put([updateOperationPriorRecovery2]);

      // Sanity check to make sure the DID Document with update is resolved correctly.
      let didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
      expect(didDocument.publicKey.length).toEqual(3);
      expect(didDocument.service![0].serviceEndpoint.instance.length).toEqual(3);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#newRecoveryKey', KeyUsage.recovery);
      const [newSigningPublicKey, newSigningPrivateKey] = await Cryptography.generateKeyPairHex('#newSigningKey', KeyUsage.signing);
      const newServiceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['newDummyHubUri1', 'newDummyHubUri2']);

      // Create the recover operation and insert it to the operation store.
      const recoveryDocumentModel = Document.create([newRecoveryPublicKey, newSigningPublicKey], [newServiceEndpoint]);
      const recoveryPayload = {
        didUniqueSuffix,
        newDidDocument: recoveryDocumentModel
      };
      const anchoredRecoveryOperation =
        await OperationGenerator.createAnchoredOperation(OperationType.Recover, recoveryPayload, recoveryPublicKey.id, recoveryPrivateKey, 4, 4, 4);
      await operationStore.put([anchoredRecoveryOperation]);

      // Create an update operation after the recovery operation.
      const updatePayloadAfterRecovery1 = OperationGenerator.createUpdatePayloadForAddingAKey(
        anchoredRecoveryOperation,
        '#newSigningKey2',
        '111111111111111111111111111111111111111111111111111111111111111111'
      );
      const updateOperationAfterRecovery1 = await
        OperationGenerator.createAnchoredOperation(OperationType.Update, updatePayloadAfterRecovery1, newSigningPublicKey.id, newSigningPrivateKey, 5, 5, 5);
      await operationStore.put([updateOperationAfterRecovery1]);

      // Create another update and insert it to the operation store.
      const updatePayloadAfterRecovery2 = await OperationGenerator.createUpdatePayloadForHubEndpoints(didUniqueSuffix, [], ['newDummyHubUri1']);
      const updateOperationAfterRecovery2 = await
        OperationGenerator.createAnchoredOperation(OperationType.Update, updatePayloadAfterRecovery2, newSigningPublicKey.id, newSigningPrivateKey, 6, 6, 6);
      await operationStore.put([updateOperationAfterRecovery2]);

      // Validate recover operation getting applied.
      didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

      expect(didDocument).toBeDefined();
      expect(didDocument.publicKey.length).toEqual(3);
      const actualNewRecoveryPublicKey = Document.getPublicKey(didDocument, '#newRecoveryKey');
      const actualNewSigningPublicKey1 = Document.getPublicKey(didDocument, '#newSigningKey');
      const actualNewSigningPublicKey2 = Document.getPublicKey(didDocument, '#newSigningKey2');
      expect(actualNewRecoveryPublicKey).toBeDefined();
      expect(actualNewSigningPublicKey1).toBeDefined();
      expect(actualNewSigningPublicKey2).toBeDefined();
      expect(actualNewRecoveryPublicKey!.publicKeyHex).toEqual(newRecoveryPublicKey.publicKeyHex);
      expect(actualNewSigningPublicKey1!.publicKeyHex).toEqual(newSigningPublicKey.publicKeyHex);
      expect(actualNewSigningPublicKey2!.publicKeyHex).toEqual('111111111111111111111111111111111111111111111111111111111111111111');
      expect(didDocument.service).toBeDefined();
      expect(didDocument.service!.length).toEqual(1);
      expect(didDocument.service![0].serviceEndpoint).toBeDefined();
      expect(didDocument.service![0].serviceEndpoint.instance).toBeDefined();
      expect(didDocument.service![0].serviceEndpoint.instance.length).toEqual(1);
      expect(didDocument.service![0].serviceEndpoint.instance[0]).toEqual('newDummyHubUri2');
    });
  });
});
