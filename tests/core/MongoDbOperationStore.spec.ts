import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import MongoDb from '../common/MongoDb';
import MongoDbOperationStore from '../../lib/core/MongoDbOperationStore';
import OperationGenerator from '../generators/OperationGenerator';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

const databaseName = 'sidetree-test';
const operationCollectionName = 'operations-test';

async function createOperationStore (mongoDbConnectionString: string): Promise<IOperationStore> {
  const operationStore = new MongoDbOperationStore(mongoDbConnectionString, databaseName, operationCollectionName);
  await operationStore.initialize();
  return operationStore;
}

/**
 * Constructs an operation chain that starts with the given create operation followed by a number of update operations.
 * @param transactionNumber The transaction number to use for all the operations created. If undefined, the array index is used.
 */
async function createOperationChain (
  createOperation: AnchoredOperationModel,
  firstUpdateRevealValueEncodedString: string,
  chainLength: number,
  signingKeyId: string,
  signingPrivateKey: string,
  transactionNumber?: number):
  Promise<AnchoredOperationModel[]> {
  const didUniqueSuffix = createOperation.didUniqueSuffix;
  const chain = new Array<AnchoredOperationModel>(createOperation);
  let updateRevealValueEncodedString = firstUpdateRevealValueEncodedString;

  for (let i = 1; i < chainLength ; i++) {
    const transactionNumberToUse = transactionNumber ? transactionNumber : i;
    const transactionTimeToUse = transactionNumberToUse;

    const [nextUpdateRevealValue, nextUpdateCommitmentHash] = OperationGenerator.generateCommitRevealPair();
    const operationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix,
      updateRevealValueEncodedString,
      `key${i}`,
      '000000000000000000000000000000000000000000000000000000000000000000',
      nextUpdateCommitmentHash,
      signingKeyId,
      signingPrivateKey
    );
    const operationModel = await UpdateOperation.parse(Buffer.from(JSON.stringify(operationRequest)));
    const anchoredOperation: AnchoredOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      operationModel, transactionTimeToUse, transactionNumberToUse, i
    );
    chain.push(anchoredOperation);
    updateRevealValueEncodedString = nextUpdateRevealValue;
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
}

// Check if two operation arrays are equal
function checkEqualArray (putOperations: AnchoredOperationModel[], gotOperations: AnchoredOperationModel[]): void {
  expect(gotOperations.length).toEqual(putOperations.length);

  for (let i = 0 ; i < putOperations.length ; i++) {
    checkEqual(gotOperations[i], putOperations[i]);
  }
}

describe('MongoDbOperationStore', async () => {

  let operationStore: IOperationStore;
  const config = require('../json/config-test.json');

  let mongoServiceAvailable = false;
  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      operationStore = await createOperationStore(config.mongoDbConnectionString);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await operationStore.delete();
  });

  it('should get a put create operation', async () => {
    const operationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = operationData.anchoredOperationModel;
    await operationStore.put([anchoredOperationModel]);
    const returnedOperations = await operationStore.get(anchoredOperationModel.didUniqueSuffix);
    checkEqualArray([anchoredOperationModel], returnedOperations);
  });

  it('should get a put update operation', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const [, anyUnusedCommitmentHash] = OperationGenerator.generateCommitRevealPair();

    // Generate an update operation.
    const operationRequest = await OperationGenerator.createUpdateOperationRequestForHubEndpoints(
      didUniqueSuffix,
      'anyUnusedUpdateRevealValue',
      anyUnusedCommitmentHash,
      'someID',
      [],
      createOperationData.signingKeyId,
      createOperationData.signingPrivateKey
    );
    const operationModel = await UpdateOperation.parse(Buffer.from(JSON.stringify(operationRequest)));
    const anchoredUpdateOperation: AnchoredOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      operationModel, 1, 1, 0
    );

    await operationStore.put([anchoredUpdateOperation]);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray([anchoredUpdateOperation], returnedOperations);
  });

  it('should ignore duplicate updates', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const [, anyUnusedCommitmentHash] = OperationGenerator.generateCommitRevealPair();

    // Generate an update operation.
    const operationRequest = await OperationGenerator.createUpdateOperationRequestForHubEndpoints(
      didUniqueSuffix,
      'anyUnusedUpdateRevealValue',
      anyUnusedCommitmentHash,
      'someId',
      [],
      createOperationData.signingKeyId,
      createOperationData.signingPrivateKey
    );
    const operationModel = await UpdateOperation.parse(Buffer.from(JSON.stringify(operationRequest)));
    const anchoredUpdateOperation: AnchoredOperationModel = OperationGenerator.createAnchoredOperationModelFromOperationModel(
      operationModel, 1, 1, 0
    );

    await operationStore.put([anchoredUpdateOperation]);
    // Insert duplicate operation
    await operationStore.put([anchoredUpdateOperation]);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray([anchoredUpdateOperation], returnedOperations);
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);
    await operationStore.put(operationChain);

    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should get all operations in a batch put with duplicates', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);

    // construct an operation chain with duplicated operations
    const batchWithDuplicates = operationChain.concat(operationChain);

    await operationStore.put(batchWithDuplicates);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should delete all', async () => {
    // Use a create operation to generate a DID
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
    const anchoredOperationModel = createOperationData.anchoredOperationModel;
    const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);

    await operationStore.put(operationChain);
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
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);
    await operationStore.put(operationChain);
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
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);
    await operationStore.put(operationChain);
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
    const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
    const signingKeyId = createOperationData.signingKeyId;
    const signingPrivateKey = createOperationData.signingPrivateKey;

    const chainSize = 10;
    const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);

    // Insert operations in reverse transaction time order
    for (let i = chainSize - 1 ; i >= 0 ; i--) {
      await operationStore.put([operationChain[i]]);
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
      const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
      const signingKeyId = createOperationData.signingKeyId;
      const signingPrivateKey = createOperationData.signingPrivateKey;

      const chainSize = 10;
      const operationChain = await createOperationChain(anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey);
      await operationStore.put(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      let expectedRemainingOperations = [anchoredOperationModel];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });

    it('should delete earlier updates in the same transaction correctly', async () => {
      // Use a create operation to generate a DID
      const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 0, transactionNumber: 0, operationIndex: 0 });
      const anchoredOperationModel = createOperationData.anchoredOperationModel;
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const nextUpdateRevealValueEncodedString = createOperationData.nextUpdateRevealValueEncodedString;
      const signingKeyId = createOperationData.signingKeyId;
      const signingPrivateKey = createOperationData.signingPrivateKey;

      const chainSize = 10;
      const txnNumber = 1;
      const operationChain = await createOperationChain(
        anchoredOperationModel, nextUpdateRevealValueEncodedString, chainSize, signingKeyId, signingPrivateKey, txnNumber);
      await operationStore.put(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      let expectedRemainingOperations = [anchoredOperationModel];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });
  });
});
