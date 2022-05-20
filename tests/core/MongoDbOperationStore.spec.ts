import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import JsObject from '../../lib/core/versions/latest/util/JsObject';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import { MongoClient } from 'mongodb';
import MongoDb from '../common/MongoDb';
import MongoDbOperationStore from '../../lib/core/MongoDbOperationStore';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import PublicKeyModel from '../../lib/core/versions/latest/models/PublicKeyModel';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

const databaseName = 'sidetree-test';

async function createOperationStore (mongoDbConnectionString: string): Promise<IOperationStore> {
  const operationStore = new MongoDbOperationStore(mongoDbConnectionString, databaseName);
  await operationStore.initialize();
  return operationStore;
}

/**
 * Constructs an operation chain that starts with the given create operation followed by a number of update operations.
 * @param transactionNumber The transaction number to use for all the operations created. If undefined, the array index is used.
 */
async function createOperationChain (
  createOperation: AnchoredOperationModel,
  chainLength: number,
  signingKey: PublicKeyModel,
  signingPrivateKey: JwkEs256k,
  transactionNumber?: number):
  Promise<AnchoredOperationModel[]> {
  const didUniqueSuffix = createOperation.didUniqueSuffix;
  const chain = new Array<AnchoredOperationModel>(createOperation);

  let currentPublicKey = signingKey;
  let currentPrivateKey = signingPrivateKey;
  for (let i = 1; i < chainLength; i++) {
    const transactionNumberToUse = transactionNumber || i;
    const transactionTimeToUse = transactionNumberToUse;

    const [newPublicKey, newPrivateKey] = await OperationGenerator.generateKeyPair(`key${i}`);
    const operationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix,
      currentPublicKey.publicKeyJwk,
      currentPrivateKey,
      newPublicKey, // we add the same key as the secret public key value for convenience, this should not be by user
      Multihash.canonicalizeThenDoubleHashThenEncode(newPublicKey.publicKeyJwk)
    );
    currentPublicKey = newPublicKey;
    currentPrivateKey = newPrivateKey;
    const operationModel = await UpdateOperation.parse(Buffer.from(JSON.stringify(operationRequest)));
    const anchoredOperation: AnchoredOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      operationModel, transactionTimeToUse, transactionNumberToUse, i
    );
    chain.push(anchoredOperation);
  }
  return chain;
}

// Check if two operations are equal
function checkEqual (operation1: AnchoredOperationModel, operation2: AnchoredOperationModel): void {
  expect(operation1.transactionNumber).toBeDefined();
  expect(operation2.transactionNumber).toBeDefined();
  expect(operation1.transactionNumber).toEqual(operation2.transactionNumber);
  expect(operation1.operationIndex).toBeDefined();
  expect(operation2.operationIndex).toBeDefined();
  expect(operation1.operationIndex).toEqual(operation2.operationIndex);
  expect(operation1.transactionTime).toBeDefined();
  expect(operation2.transactionTime).toBeDefined();
  expect(operation1.transactionTime).toEqual(operation2.transactionTime);
  expect(operation1.didUniqueSuffix).toEqual(operation2.didUniqueSuffix);
  expect(operation1.type).toEqual(operation2.type);
  expect(operation1.operationBuffer).toEqual(operation2.operationBuffer);
}

// Check if two operation arrays are equal
function checkEqualArray (putOperations: AnchoredOperationModel[], gotOperations: AnchoredOperationModel[]): void {
  expect(gotOperations.length).toEqual(putOperations.length);

  for (let i = 0; i < putOperations.length; i++) {
    checkEqual(gotOperations[i], putOperations[i]);
  }
}

describe('MongoDbOperationStore', async () => {

  let operationStore: IOperationStore;
  const config = require('../json/config-test.json');
  beforeAll(async () => {
    await MongoDb.createInmemoryDb(config);
    operationStore = await createOperationStore(config.mongoDbConnectionString);
  });

  beforeEach(async () => {
    await operationStore.delete();
  });

  it('should create collection when initialize is called', async () => {
    // Make a new instance of operation store and initialize
    const databaseName = 'test-new-db';
    const emptyOperationStore = new MongoDbOperationStore(config.mongoDbConnectionString, databaseName);
    await emptyOperationStore.initialize();

    // Make connection to mongo db to verify collection exists
    const client = await MongoClient.connect(config.mongoDbConnectionString, { useNewUrlParser: true });
    const db = client.db(databaseName);
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbOperationStore.collectionName)).toBeTruthy();

    // clean up
    await db.dropDatabase();
  });

  describe('insertOrReplace()', () => {
    it('should be able to insert an create operation successfully.', async () => {
      const operationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = operationData.anchoredOperationModel;
      await operationStore.insertOrReplace([anchoredOperationModel]);
      const returnedOperations = await operationStore.get(anchoredOperationModel.didUniqueSuffix);
      checkEqualArray([anchoredOperationModel], returnedOperations);
    });

    it('should be able to insert an update operation successfully.', async () => {
      // Use a create operation to generate a DID
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;

      // Generate an update operation.
      const operationRequest = await OperationGenerator.generateUpdateOperationRequestForServices(
        didUniqueSuffix,
        createOperationData.signingPublicKey.publicKeyJwk,
        createOperationData.signingPrivateKey,
        OperationGenerator.generateRandomHash(),
        'someID',
        []
      );
      const operationModel = await UpdateOperation.parse(Buffer.from(JSON.stringify(operationRequest)));
      const anchoredUpdateOperation: AnchoredOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(
        operationModel, 1, 1, 0
      );

      await operationStore.insertOrReplace([anchoredUpdateOperation]);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray([anchoredUpdateOperation], returnedOperations);
    });

    it('should replace an existing operations successfully.', async () => {
      // Use a create operation to generate a DID
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;

      // Deep clone the create request to strip off the `delta` property.
      const clonedCreateRequestWithoutDelta = JsObject.deepCopyObject(createOperationData.operationRequest);
      delete clonedCreateRequestWithoutDelta.delta;

      // Create an anchored create operation without `delta` property in the operation buffer.
      const anchoredOperationModelWithoutDelta = JsObject.deepCopyObject(anchoredOperationModel);
      anchoredOperationModelWithoutDelta.operationBuffer = Buffer.from(JSON.stringify(clonedCreateRequestWithoutDelta));

      // Insert the anchored operation without `delta` into DB first.
      await operationStore.insertOrReplace([anchoredOperationModelWithoutDelta]);
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const returnedOperations1 = await operationStore.get(didUniqueSuffix);
      checkEqualArray([anchoredOperationModelWithoutDelta], returnedOperations1);

      // Insert the anchored operation with `delta` into DB.
      await operationStore.insertOrReplace([anchoredOperationModel]);
      const returnedOperations2 = await operationStore.get(didUniqueSuffix);
      checkEqualArray([anchoredOperationModel], returnedOperations2);
    });
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);
    await operationStore.insertOrReplace(operationChain);

    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should get all operations in a batch put with duplicates', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);

    // construct an operation chain with duplicated operations
    const batchWithDuplicates = operationChain.concat(operationChain);

    await operationStore.insertOrReplace(batchWithDuplicates);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should delete all', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);

    await operationStore.insertOrReplace(operationChain);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);

    await operationStore.delete();
    const returnedOperationsAfterRollback = await operationStore.get(didUniqueSuffix);
    expect(returnedOperationsAfterRollback.length).toEqual(0);
  });

  it('should delete operations with timestamp filter', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);
    await operationStore.insertOrReplace(operationChain);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);

    const rollbackTime = chainSize / 2;
    await operationStore.delete(rollbackTime);
    const returnedOperationsAfterRollback = await operationStore.get(didUniqueSuffix);
    // Returned operations should be equal to the first rollbackTime + 1 operations in the batch
    checkEqualArray(operationChain.slice(0, rollbackTime + 1), returnedOperationsAfterRollback);
  });

  it('should remember operations after stop/restart', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);
    await operationStore.insertOrReplace(operationChain);
    let returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);

    // Create another instance of the operation store
    operationStore = await createOperationStore(config.mongoDbConnectionString);

    // Check if we have all the previously put operations
    returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should get all operations in transaction time order', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const signingPublicKey = createOperationData.signingPublicKey;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);

    // Insert operations in reverse transaction time order
    for (let i = chainSize - 1; i >= 0; i--) {
      await operationStore.insertOrReplace([operationChain[i]]);
    }

    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  describe('deleteUpdatesEarlierThan()', () => {

    it('should delete updates in the earlier transactions correctly', async () => {
      // Use a create operation to generate a DID
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const signingPublicKey = createOperationData.signingPublicKey;
      const signingPrivateKey = createOperationData.signingPrivateKey;

      const chainSize = 10;
      const operationChain = await createOperationChain(anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey);
      await operationStore.insertOrReplace(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      const expectedRemainingOperations = [anchoredOperationModel];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });

    it('should delete earlier updates in the same transaction correctly', async () => {
      // Use a create operation to generate a DID
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const signingPublicKey = createOperationData.signingPublicKey;
      const signingPrivateKey = createOperationData.signingPrivateKey;

      const chainSize = 10;
      const txnNumber = 1;
      const operationChain = await createOperationChain(
        anchoredOperationModel, chainSize, signingPublicKey, signingPrivateKey, txnNumber);
      await operationStore.insertOrReplace(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      const expectedRemainingOperations = [anchoredOperationModel];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });
  });
});
