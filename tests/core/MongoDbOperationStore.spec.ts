import Cryptography from '../../lib/core/util/Cryptography';
import MongoDbOperationStore from '../../lib/core/MongoDbOperationStore';
import OperationGenerator from '../generators/OperationGenerator';
import ProtocolParameters from '../../lib/core/ProtocolParameters';
import { OperationStore } from '../../lib/core/OperationStore';
import { Operation } from '../../lib/core/Operation';
import { DidPublicKey } from '@decentralized-identity/did-common-typescript';
import { MongoClient } from 'mongodb';

/**
 * Construct an operation given the payload, transactionNumber, transactionTime, and operationIndex
 */
function constructAnchoredOperation (
  opBuf: Buffer,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Operation {

  const resolvedTransaction = {
    transactionNumber,
    transactionTime,
    transactionTimeHash: 'unused',
    anchorFileHash: 'unused',
    batchFileHash: 'unused'
  };

  return Operation.create(opBuf, resolvedTransaction, operationIndex);
}

/**
 * Construct a create operation anchored with a transactionNumber, transactionTime, and operationIndex
 */
async function constructAnchoredCreateOperation (
  publicKey: DidPublicKey,
  privateKey: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<Operation> {
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
  previousVersion: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number,
  operationIdentifier: number
): Promise<Operation> {

  const updatePayload = {
    didUniqueSuffix,
    previousOperationHash: previousVersion,
    patch: [{
      op: 'replace',
      path: '/publicKey/1',
      value: {
        id: '#key2',
        type: 'RsaVerificationKey2018',
        owner: 'did:sidetree:updateid' + operationIdentifier,
        publicKeyPem: process.hrtime() // Some dummy value that's not used.
      }
    }]
  };

  const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
  return constructAnchoredOperation(updateOperationBuffer, transactionNumber, transactionTime, operationIndex);
}

/**
 * Test if a mongo service is running at the specified url
 */
async function isMongoServiceAvailable (serverUrl: string): Promise<boolean> {
  try {
    const client = await MongoClient.connect(serverUrl);
    await client.close();
  } catch (error) {
    return false;
  }
  return true;
}

const databaseName = 'sidetree-test';
const operationCollectionName = 'operations-test';

/**
 * Clear a mongo collection - used to remove test state.
 */
async function removeMongoCollection (serverUrl: string) {
  const client = await MongoClient.connect(serverUrl);
  const db = client.db(databaseName);
  const collections = await db.collections();
  const collectionNames = collections.map(collection => collection.collectionName);

  // If the operation collection exists drop it
  if (collectionNames.includes(operationCollectionName)) {
    const collection = db.collection(operationCollectionName);
    await collection.drop();
  }
}

async function createOperationStore (mongoDbConnectionString: string): Promise<OperationStore> {
  const operationStore = new MongoDbOperationStore(mongoDbConnectionString, databaseName, operationCollectionName);
  await operationStore.initialize();
  return operationStore;
}

async function createBatchOfUpdateOperations (createOperation: Operation, batchSize: number, privateKey: string): Promise<Operation[]> {
  const didUniqueSuffix = createOperation.didUniqueSuffix!;
  const batch = new Array<Operation>(createOperation);
  for (let i = 1; i < batchSize ; i++) {
    const previousOperation = batch[i - 1];
    const previousVersion = previousOperation.getOperationHash();
    const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, previousVersion, i, i, 0, i);
    batch.push(operation);
  }
  return batch;
}

// Check if two operations are equal
function checkEqual (operation1: Operation, operation2: Operation): void {
  expect(operation1.transactionNumber).toBeDefined();
  expect(operation2.transactionNumber).toBeDefined();
  expect(operation1.transactionNumber!).toEqual(operation2.transactionNumber!);
  expect(operation1.operationIndex).toBeDefined();
  expect(operation2.operationIndex).toBeDefined();
  expect(operation1.operationIndex!).toEqual(operation2.operationIndex!);
  expect(operation1.transactionTime).toBeDefined();
  expect(operation2.transactionTime).toBeDefined();
  expect(operation1.transactionTime!).toEqual(operation2.transactionTime!);
  expect(operation1.didUniqueSuffix).toEqual(operation2.didUniqueSuffix);
  expect(operation1.getOperationHash()).toEqual(operation2.getOperationHash());
}

// Check if two operation arrays are equal
function checkEqualArray (putOperations: Operation[], gotOperations: Operation[]): void {
  expect(gotOperations.length).toEqual(putOperations.length);

  for (let i = 0 ; i < putOperations.length ; i++) {
    checkEqual(gotOperations[i], putOperations[i]);
  }
}

describe('MongoDbOperationStore', async () => {
  const versionsOfProtocolParameters = require('../json/protocol-parameters-test.json');
  ProtocolParameters.initialize(versionsOfProtocolParameters);

  let operationStore: OperationStore;
  let publicKey: DidPublicKey;
  let privateKey: string;
  const config = require('../json/config-test.json');

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.

    if (!await isMongoServiceAvailable(config.mongoDbConnectionString)) {
      pending('MongoDB service not available');
    }

    await removeMongoCollection(config.mongoDbConnectionString);

    operationStore = await createOperationStore(config.mongoDbConnectionString);
  });

  it('should get a put create operation', async () => {
    const operation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    await operationStore.put([operation]);
    const returnedOperations = Array.from(await operationStore.get(operation.didUniqueSuffix!));
    checkEqualArray([operation], returnedOperations);
  });

  it('should get a put update operation', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;
    const createVersion = createOperation.getOperationHash();
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, createVersion, 1, 1, 0, 1);
    await operationStore.put([updateOperation]);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray([updateOperation], returnedOperations);
  });

  it('should ignore duplicate updates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;
    const createVersion = createOperation.getOperationHash();
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, createVersion, 1, 1, 0, 1);
    await operationStore.put([updateOperation]);
    // duplicate operation
    await operationStore.put([updateOperation]);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray([updateOperation], returnedOperations);
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);
    await operationStore.put(batch);

    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);
  });

  it('should get all operations in a batch put with duplicates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);
        // construct a batch with each operation duplicated.
    const batchWithDuplicates = batch.concat(batch);

    await operationStore.put(batchWithDuplicates);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);
  });

  it('should delete all', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);

    await operationStore.put(batch);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);

    await operationStore.delete();
    const returnedOperationsAfterRollback = Array.from(await operationStore.get(didUniqueSuffix));
    expect(returnedOperationsAfterRollback.length).toEqual(0);
  });

  it('should delete operations with timestamp filter', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);
    await operationStore.put(batch);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);

    const rollbackTime = batchSize / 2;
    await operationStore.delete(rollbackTime);
    const returnedOperationsAfterRollback = Array.from(await operationStore.get(didUniqueSuffix));
    // Returned operations should be equal to the first rollbackTime + 1 operations in the batch
    checkEqualArray(batch.slice(0, rollbackTime + 1), returnedOperationsAfterRollback);
  });

  it('should remember operations after stop/restart', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);
    await operationStore.put(batch);
    let returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);

    // Create another instance of the operation store
    operationStore = await createOperationStore(config.mongoDbConnectionString);

    // Check if we have all the previously put operations
    returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);
  });

  it('should get all operations in transaction time order', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = await createBatchOfUpdateOperations(createOperation, batchSize, privateKey);

    // Insert operations in reverse transaction time order
    for (let i = batchSize - 1 ; i >= 0 ; i--) {
      await operationStore.put([batch[i]]);
    }

    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));
    checkEqualArray(batch, returnedOperations);
  });
});
