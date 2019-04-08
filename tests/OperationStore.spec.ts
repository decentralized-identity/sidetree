import Cryptography from '../src/lib/Cryptography';
import MockOperationStore from './mocks/MockOperationStore';
import OperationGenerator from './generators/OperationGenerator';
import { Config, ConfigKey } from '../src/Config';
import { OperationStore } from '../src/OperationStore';
import { initializeProtocol } from '../src/Protocol';
import { Operation } from '../src/Operation';
import { DidPublicKey } from '@decentralized-identity/did-common-typescript';

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
  did: string,
  previousVersion: string,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number,
  operationNumber: number
): Promise<Operation> {

  const updatePayload = {
    did,
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

  const updateOperationBuffer = await OperationGenerator.generateUpdateOperation(updatePayload, '#key1', privateKey);
  return constructAnchoredOperation(updateOperationBuffer, transactionNumber, transactionTime, operationIndex);
}

describe('OperationStore', async () => {
  initializeProtocol('protocol-test.json');

  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);
  const didMethodName = config[ConfigKey.DidMethodName];
  let operationStore: OperationStore;
  let publicKey: DidPublicKey;
  let privateKey: string;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.
    operationStore = new MockOperationStore();
  });

  it('should get a put create operation', async () => {
    const operation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    await operationStore.putBatch([operation]);
    const returnedOperations = Array.from(await operationStore.get(operation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(0);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(0);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(0);
    expect(returnedOperation.getDidUniqueSuffix()).toEqual(operation.getDidUniqueSuffix());
    expect(returnedOperation.getOperationHash()).toEqual(operation.getOperationHash());
  });

  it('should get a put update operation', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const did = didMethodName + createOperation.getDidUniqueSuffix();
    const createVersion = createOperation.getOperationHash();
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, did, createVersion, 1, 1, 0, 1);
    await operationStore.putBatch([updateOperation]);
    const returnedOperations = Array.from(await operationStore.get(createOperation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];
    const returnedOperationHash = returnedOperation.getOperationHash();

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(1);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(0);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(1);
    expect(returnedOperation.getDidUniqueSuffix()).toEqual(createOperation.getDidUniqueSuffix());
    expect(returnedOperationHash).toEqual(updateOperation.getOperationHash());
  });

  it('should ignore duplicate updates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const did = didMethodName + createOperation.getDidUniqueSuffix();
    const createVersion = createOperation.getOperationHash();
    const updateOperation = await constructAnchoredUpdateOperation(privateKey, did, createVersion, 1, 1, 0, 1);
    await operationStore.putBatch([updateOperation]);
    // duplicate operation
    await operationStore.putBatch([updateOperation]);
    const returnedOperations = Array.from(await operationStore.get(createOperation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];
    const returnedOperationHash = returnedOperation.getOperationHash();

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(1);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(0);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(1);
    expect(returnedOperation.getDidUniqueSuffix()).toEqual(createOperation.getDidUniqueSuffix());
    expect(returnedOperationHash).toEqual(updateOperation.getOperationHash());
  });

  it('should get all operations in a batch put', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const did = didMethodName + createOperation.getDidUniqueSuffix();

    const batchSize = 10;
    const batch = new Array<Operation>(createOperation);
    for (let i = 1; i < batchSize ; i++) {
      const previousOperation = batch[i - 1];
      const previousVersion = previousOperation.getOperationHash();
      const operation = await constructAnchoredUpdateOperation(privateKey, did, previousVersion, i, i, 0, i);
      batch.push(operation);
    }

    await operationStore.putBatch(batch);
    const returnedOperations = Array.from(await operationStore.get(createOperation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(batchSize);
    for (let i = 0 ; i < batchSize ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(didMethodName + returnedOperation.getDidUniqueSuffix()).toEqual(did);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i].getOperationHash());
    }
  });

  it('should get all operations in a batch put with duplicates', async () => {
    // Use a create operation to generate a DID
    const createOperation = await constructAnchoredCreateOperation(publicKey, privateKey, 0, 0, 0);
    const did = didMethodName + createOperation.getDidUniqueSuffix();

    const batchSize = 10;
    const batch = new Array<Operation>(createOperation);
    // construct a batch with each operation duplicated.
    for (let i = 1; i < batchSize ; i++) {
      const previousOperation = batch[i - 1];
      const previousVersion = previousOperation.getOperationHash();
      const operation = await constructAnchoredUpdateOperation(privateKey, did, previousVersion, i, i, 0, i);
      batch.push(operation);
      batch.push(operation); // duplicate
    }

    await operationStore.putBatch(batch);
    const returnedOperations = Array.from(await operationStore.get(createOperation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(batchSize);
    for (let i = 0 ; i < batchSize ; i++) {
      const returnedOperation = returnedOperations[i];

      expect(returnedOperation.transactionNumber).toBeDefined();
      expect(returnedOperation.transactionNumber!).toEqual(i);
      expect(returnedOperation.operationIndex).toBeDefined();
      expect(returnedOperation.operationIndex!).toEqual(0);
      expect(returnedOperation.transactionTime).toBeDefined();
      expect(returnedOperation.transactionTime!).toEqual(i);
      expect(didMethodName + returnedOperation.getDidUniqueSuffix()).toEqual(did);
      expect(returnedOperation.getOperationHash()).toEqual(batch[i * 2].getOperationHash());
    }
  });
});
