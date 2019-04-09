import Cryptography from '../src/lib/Cryptography';
import MockOperationStore from './mocks/MockOperationStore';
import OperationGenerator from './generators/OperationGenerator';
import { OperationStore } from '../src/OperationStore';
import { initializeProtocol } from '../src/Protocol';
import { Operation } from '../src/Operation';
import { DidPublicKey } from '@decentralized-identity/did-common-typescript';
import MongoDbOperationStore from '../src/MongoDbOperationStore';
import { MongoClient } from 'mongodb';
import { Config, ConfigKey } from '../src/Config';

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

async function constructAnchoredCreateOperation (
  publicKey: DidPublicKey,
  privateKey: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<Operation> {
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');
  const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
  const operation = constructAnchoredOperation(operationBuffer, transactionNumber, transactionTime, operationIndex);
  return operation;
}

async function constructAnchoredUpdateOperation (
  privateKey: string,
  didUniqueSuffix: string,
  previousVersion: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number,
  operationNumber: number
): Promise<Operation> {

  const updatePayload = {
    didUniqueSuffix,
    operationNumber,
    previousOperationHash: previousVersion,
    patch: [{
      op: 'replace',
      path: '/publicKey/1',
      value: {
        id: '#key2',
        type: 'RsaVerificationKey2018',
        owner: 'did:sidetree:updateid' + operationNumber,
        publicKeyPem: process.hrtime() // Some dummy value that's not used.
      }
    }]
  };

  const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
  return constructAnchoredOperation(updateOperationBuffer, transactionNumber, transactionTime, operationIndex);
}

async function clearMongoCollection () {
  const databaseName = 'sidetree';
  const operationCollectionName = 'operations';
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const db = client.db(databaseName);
  const collections = await db.collections();
  const collectionNames = collections.map(collection => collection.collectionName);

  // If the operation collection exists, use it; else create it then use it.
  if (collectionNames.includes(operationCollectionName)) {
    const collection = db.collection(operationCollectionName);
    await collection.drop();
  }
}

enum OperationStoreType {
  Mongo,
  Mock
}

async function getOperationStore (operationStoreType: OperationStoreType): Promise<OperationStore> {
  if (operationStoreType === OperationStoreType.Mongo) {
    const configFile = require('../json/config-test.json');
    const config = new Config(configFile);
    const operationStore = new MongoDbOperationStore(config[ConfigKey.OperationStoreUri]);
    await operationStore.initialize();
    return operationStore;
  } else {
    return new MockOperationStore();
  }
}

describe('OperationStore', async () => {
  initializeProtocol('protocol-test.json');

  // Change to OperationStoreType.Mongo to test Mongo-based store
  let operationStoreType = OperationStoreType.Mock;
  let operationStore: OperationStore;
  let publicKey: DidPublicKey;
  let privateKey: string;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.

    if (operationStoreType === OperationStoreType.Mongo) {
      await clearMongoCollection();
    }

    operationStore = await getOperationStore(operationStoreType);
  });

  it('should get a put create operation', async () => {
    const operation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    await operationStore.putBatch([operation]);
    const returnedOperations = Array.from(await operationStore.get(operation.didUniqueSuffix!));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(0);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(0);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(0);
    expect(returnedOperation.didUniqueSuffix).toEqual(operation.didUniqueSuffix);
    expect(returnedOperation.getOperationHash()).toEqual(operation.getOperationHash());
  });

  it('should get a put update operation', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;
    const createVersion = createOperation.getOperationHash();
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, createVersion, 1, 1, 0, 1);
    await operationStore.putBatch([updateOperation]);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];
    const returnedOperationHash = returnedOperation.getOperationHash();

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(1);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(0);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(1);
    expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
    expect(returnedOperationHash).toEqual(updateOperation.getOperationHash());
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = new Array<Operation>(createOperation);
    for (let i = 1; i < batchSize ; i++) {
      const previousOperation = batch[i - 1];
      const previousVersion = previousOperation.getOperationHash();
      const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, previousVersion, i, i, 0, i);
      batch.push(operation);
    }

    await operationStore.putBatch(batch);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

    expect(returnedOperations.length).toEqual(batchSize);
    for (let i = 0 ; i < batchSize ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
    }
  });

  it('should delete all', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = new Array<Operation>(createOperation);
    for (let i = 1; i < batchSize ; i++) {
      const previousOperation = batch[i - 1];
      const previousVersion = previousOperation.getOperationHash();
      const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, previousVersion, i, i, 0, i);
      batch.push(operation);
    }

    await operationStore.putBatch(batch);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

    expect(returnedOperations.length).toEqual(batchSize);
    for (let i = 0 ; i < batchSize ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
    }

    await operationStore.delete();
    const returnedOperationsAfterRollback = Array.from(await operationStore.get(didUniqueSuffix));
    expect(returnedOperationsAfterRollback.length).toEqual(0);
  });

  it('should delete operations with timestamp filter', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const didUniqueSuffix = createOperation.didUniqueSuffix!;

    const batchSize = 10;
    const batch = new Array<Operation>(createOperation);
    for (let i = 1; i < batchSize ; i++) {
      const previousOperation = batch[i - 1];
      const previousVersion = previousOperation.getOperationHash();
      const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, previousVersion, i, i, 0, i);
      batch.push(operation);
    }

    await operationStore.putBatch(batch);
    const returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

    expect(returnedOperations.length).toEqual(batchSize);
    for (let i = 0 ; i < batchSize ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
    }

    const rollbackTime = batchSize / 2;
    await operationStore.delete(rollbackTime);
    const returnedOperationsAfterRollback = Array.from(await operationStore.get(didUniqueSuffix));
    expect(returnedOperationsAfterRollback.length).toEqual(rollbackTime + 1);
    for (let i = 0 ; i <= rollbackTime ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
    }
  });

  it('should remember operations after stop/restart', async () => {
    if (operationStoreType === OperationStoreType.Mongo) {
      // Use a create operation to generate a DID
      const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
      const didUniqueSuffix = createOperation.didUniqueSuffix!;

      const batchSize = 10;
      const batch = new Array<Operation>(createOperation);
      for (let i = 1; i < batchSize; i++) {
        const previousOperation = batch[i - 1];
        const previousVersion = previousOperation.getOperationHash();
        const operation = await constructAnchoredUpdateOperation(privateKey, didUniqueSuffix, previousVersion, i, i, 0, i);
        batch.push(operation);
      }

      await operationStore.putBatch(batch);
      let returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

      expect(returnedOperations.length).toEqual(batchSize);
      for (let i = 0; i < batchSize; i++) {
        const returnedOperation = returnedOperations[i];

        expect(returnedOperation.transactionNumber).toBeDefined();
        expect(returnedOperation.transactionNumber!).toEqual(i);
        expect(returnedOperation.operationIndex).toBeDefined();
        expect(returnedOperation.operationIndex!).toEqual(0);
        expect(returnedOperation.transactionTime).toBeDefined();
        expect(returnedOperation.transactionTime!).toEqual(i);
        expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
        expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
      }

      // Create another instance of the operation store
      operationStore = await getOperationStore(OperationStoreType.Mongo);

      // Check if we have all the previously put operations
      returnedOperations = Array.from(await operationStore.get(didUniqueSuffix));

      expect(returnedOperations.length).toEqual(batchSize);
      for (let i = 0; i < batchSize; i++) {
        const returnedOperation = returnedOperations[i];

        expect(returnedOperation.transactionNumber).toBeDefined();
        expect(returnedOperation.transactionNumber!).toEqual(i);
        expect(returnedOperation.operationIndex).toBeDefined();
        expect(returnedOperation.operationIndex!).toEqual(0);
        expect(returnedOperation.transactionTime).toBeDefined();
        expect(returnedOperation.transactionTime!).toEqual(i);
        expect(returnedOperation.didUniqueSuffix).toEqual(didUniqueSuffix);
        expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
      }
    }
  });
});
