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

  describe('Recovery operation', () => {
    fit('should not apply operation and returns false if DID document is not given', async () => {
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

      // Create an update to the DID and insert it to the operation store.
      const updatePayload = await OperationGenerator.createUpdatePayloadForAddingAKey(
        anchoredCreateOperation,
        '#new-key1',
        '000000000000000000000000000000000000000000000000000000000000000000'
      );

      const anchoredUpdateOperation =
        await OperationGenerator.createAnchoredOperation(OperationType.Update, updatePayload, signingPublicKey.id, signingPrivateKey, 2, 2, 2);
      await operationStore.put([anchoredUpdateOperation]);

      // Sanity check to make sure the DID Document with update is resolved correctly.
      let didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;
      expect(didDocument.publicKey.length).toEqual(3);

      // Create new keys used for new document for recovery request.
      const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#newRecoveryKey', KeyUsage.recovery);
      const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#newSigningKey', KeyUsage.signing);
      const newServiceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['newDummyHubUri1', 'newDummyHubUri2']);

      // Create the recover operation and insert it to the operation store.
      const recoveryDocumentModel = Document.create([newRecoveryPublicKey, newSigningPublicKey], [newServiceEndpoint]);
      const recoveryPayload = {
        didUniqueSuffix,
        newDidDocument: recoveryDocumentModel
      };
      const anchoredRecoveryOperation =
        await OperationGenerator.createAnchoredOperation(OperationType.Recover, recoveryPayload, recoveryPublicKey.id, recoveryPrivateKey, 3, 3, 3);
      await operationStore.put([anchoredRecoveryOperation]);

      // Validate recover operation getting applied.
      didDocument = await resolver.resolve(didUniqueSuffix) as DocumentModel;

      expect(didDocument).toBeDefined();
      expect(didDocument.publicKey.length).toEqual(2);
      const actualNewRecoveryPublicKey = Document.getPublicKey(didDocument, '#newRecoveryKey');
      const actualNewSigningPublicKey = Document.getPublicKey(didDocument, '#newSigningKey');
      expect(actualNewRecoveryPublicKey).toBeDefined();
      expect(actualNewSigningPublicKey).toBeDefined();
      expect(actualNewRecoveryPublicKey!.publicKeyHex).toEqual(newRecoveryPublicKey.publicKeyHex);
      expect(actualNewSigningPublicKey!.publicKeyHex).toEqual(newSigningPublicKey.publicKeyHex);
    });
  });
});
