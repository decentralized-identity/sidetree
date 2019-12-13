import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MongoDb from '../common/MongoDb';
import MongoDbOperationStore from '../../lib/core/MongoDbOperationStore';
import OperationGenerator from '../generators/OperationGenerator';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';

/**
 * Construct an operation given the payload, transactionNumber, transactionTime, and operationIndex
 */
function constructAnchoredOperation (
  operationBuffer: Buffer,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): AnchoredOperation {

  const anchoredOperationModel: AnchoredOperationModel = {
    transactionNumber,
    transactionTime,
    operationIndex,
    operationBuffer
  };

  return AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
}

/**
 * Construct a create operation anchored with a transactionNumber, transactionTime, and operationIndex
 */
async function constructAnchoredCreateOperation (
  publicKey: DidPublicKeyModel,
  privateKey: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<AnchoredOperation> {
  const didDocumentTemplate = require('../json/didDocumentTemplate.json');
  const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
  const operation = constructAnchoredOperation(operationBuffer, transactionNumber, transactionTime, operationIndex);
  return operation;
}

/**
 * Construct an update operation anchored with a transactionNumber, transactionTime, and operationIndex
 */
async function constructAnchoredUpdateOperation (
  privateKey: string,
  didUniqueSuffix: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number
): Promise<AnchoredOperation> {

  const updatePayload = {
    didUniqueSuffix,
    patches: [
      {
        action: 'add-public-keys',
        publicKeys: [
          {
            id: '#key2',
            type: 'RsaVerificationKey2018',
            usage: 'signing',
            publicKeyPem: new Date(Date.now()).toLocaleString() // Some dummy value that's not used.
          }
        ]
      }
    ]
  };

  const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
  return constructAnchoredOperation(updateOperationBuffer, transactionNumber, transactionTime, operationIndex);
}

const databaseName = 'sidetree-test';
const operationCollectionName = 'operations-test';

async function createOperationStore (mongoDbConnectionString: string): Promise<IOperationStore> {
  const operationStore = new MongoDbOperationStore(mongoDbConnectionString, databaseName, operationCollectionName);
  await operationStore.initialize();
  return operationStore;
}

/**
 * Constructs an operation chain from the given create opeartion.
 * @param transactionNumber The transaction number to use for all the operations created. If undefined, the array index is used.
 */
async function createOperationChain (
  createOperation: AnchoredOperation,
  chainLength: number,
  privateKey: string,
  transactionNumber?: number):
  Promise<AnchoredOperation[]> {
  const didUniqueSuffix = createOperation.didUniqueSuffix;
  const chain = new Array<AnchoredOperation>(createOperation);
  for (let i = 1; i < chainLength ; i++) {
    const transactionNumberToUse = transactionNumber ? transactionNumber : i;
    const transactionTimeToUse = transactionNumberToUse;
    const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, transactionNumberToUse, transactionTimeToUse, i);
    chain.push(operation);
  }
  return chain;
}

// Check if two operations are equal
function checkEqual (operation1: AnchoredOperation, operation2: AnchoredOperation): void {
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
  expect(operation1.operationHash).toEqual(operation2.operationHash);
}

// Check if two operation arrays are equal
function checkEqualArray (putOperations: AnchoredOperation[], gotOperations: AnchoredOperationModel[]): void {
  expect(gotOperations.length).toEqual(putOperations.length);

  for (let i = 0 ; i < putOperations.length ; i++) {
    const gotOperation = AnchoredOperation.createAnchoredOperation(gotOperations[i]);
    checkEqual(gotOperation, putOperations[i]);
  }
}

describe('MongoDbOperationStore', async () => {

  let operationStore: IOperationStore;
  let publicKey: DidPublicKeyModel;
  let privateKey: string;
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

    // Generate a unique key-pair used for each test.
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
  });

  it('should get a put create operation', async () => {
    const operation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    await operationStore.put([operation]);
    const returnedOperations = await operationStore.get(operation.didUniqueSuffix);
    checkEqualArray([operation], returnedOperations);
  });

  it('should get a put update operation', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, 1, 1, 0);
    await operationStore.put([updateOperation]);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray([updateOperation], returnedOperations);
  });

  it('should ignore duplicate updates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, 1, 1, 0);
    await operationStore.put([updateOperation]);
    // Insert duplicate operation
    await operationStore.put([updateOperation]);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray([updateOperation], returnedOperations);
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);
    await operationStore.put(operationChain);

    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should get all operations in a batch put with duplicates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);

    // construct an operation chain with duplicated operations
    const batchWithDuplicates = operationChain.concat(operationChain);

    await operationStore.put(batchWithDuplicates);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);
  });

  it('should delete all', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);

    await operationStore.put(operationChain);
    const returnedOperations = await operationStore.get(didUniqueSuffix);
    checkEqualArray(operationChain, returnedOperations);

    await operationStore.delete();
    const returnedOperationsAfterRollback = await operationStore.get(didUniqueSuffix);
    expect(returnedOperationsAfterRollback.length).toEqual(0);
  });

  it('should delete operations with timestamp filter', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);
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
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);
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
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix;

    const chainSize = 10;
    const operationChain = await createOperationChain(createOperation, chainSize, privateKey);

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
      const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
      const didUniqueSuffix = createOperation.didUniqueSuffix;

      const chainSize = 10;
      const operationChain = await createOperationChain(createOperation, chainSize, privateKey);
      await operationStore.put(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      let expectedRemainingOperations = [createOperation];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });

    it('should delete earlier updates in the same transaction correctly', async () => {
      // Use a create operation to generate a DID
      const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
      const didUniqueSuffix = createOperation.didUniqueSuffix;

      const chainSize = 10;
      const transactionNumber = 1;
      const operationChain = await createOperationChain(createOperation, chainSize, privateKey, transactionNumber);
      await operationStore.put(operationChain);
      const returnedOperations = await operationStore.get(didUniqueSuffix);
      checkEqualArray(operationChain, returnedOperations);

      const markerOperation = operationChain[5];
      await operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, markerOperation.transactionNumber, markerOperation.operationIndex);
      const returnedOperationsAfterDeletion = await operationStore.get(didUniqueSuffix);

      // Expected remaining operations is the first operation + the last 5 update operations.
      let expectedRemainingOperations = [createOperation];
      expectedRemainingOperations.push(...operationChain.slice(5));
      checkEqualArray(expectedRemainingOperations, returnedOperationsAfterDeletion);
    });
  });
});
