import { Config, ConfigKey } from '../src/Config';
import Cryptography from '../src/lib/Cryptography';
import { createOperationStore, OperationStore } from '../src/OperationStore';
import { initializeProtocol } from '../src/Protocol';
import OperationGenerator from './generators/OperationGenerator';
import { Operation } from '../src/Operation';

/**
 * Construct an operation given the payload, transactionNumber, transactionTime, and operationIndex
 */
function getOperation (
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
 * Convert an Iterable<Operation> object to Array<Operation>
 */
function toArray (ops: Iterable<Operation>) {
  const opsArray = new Array<Operation>();
  for (const op of ops) {
    opsArray.push(op);
  }

  return opsArray;
}

describe('OperationStore', async () => {
  initializeProtocol('protocol-test.json');

  const didDocumentTemplate = require('./json/didDocumentTemplate.json');
  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);
  const didMethodName = config[ConfigKey.DidMethodName];
  let operationStore: OperationStore;
  let publicKey: any;
  let privateKey: any;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.
    operationStore = createOperationStore(config);
    await operationStore.initialize(false);
  });

  it('should get a put create operation', async () => {
    const transactionNumber = 1;
    const transactionTime = 2;
    const operationIndex = 3;
    const operationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    const operation = getOperation(operationBuffer, transactionNumber, transactionTime, operationIndex);
    await operationStore.put(operation);
    const returnedOperations = toArray(await operationStore.get(operation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(transactionNumber);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(operationIndex);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(transactionTime);
    expect(returnedOperation.getDidUniqueSuffix()).toEqual(operation.getDidUniqueSuffix());
    expect(returnedOperation.getOperationHash()).toEqual(operation.getOperationHash());
  });

  it('should get a put update operation', async () => {
    const transactionNumber = 2;
    const transactionTime = 3;
    const operationIndex = 4;

    // Use a create operation to generate a DID
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    const createOperation = getOperation(createOperationBuffer, transactionNumber, transactionTime, operationIndex);
    const did = didMethodName + createOperation.getDidUniqueSuffix();
    const createVersion = createOperation.getOperationHash();

    const updatePayload = {
      did,
      operationNumber: 1,
      previousOperationHash: createVersion,
      patch: [{
        op: 'replace',
        path: '/publicKey/1',
        value: {
          id: '#key2',
          type: 'RsaVerificationKey2018',
          owner: 'did:sidetree:updateid1',
          publicKeyPem: process.hrtime() // Some dummy value that's not used.
        }
      }]
    };

    const updateOperationBuffer = await OperationGenerator.generateUpdateOperation(updatePayload, '#key1', privateKey);
    const updateOperateion = getOperation(updateOperationBuffer, transactionNumber, transactionTime, operationIndex);
    await operationStore.put(updateOperateion);
    const returnedOperations = toArray(await operationStore.get(createOperation.getDidUniqueSuffix()));

    expect(returnedOperations.length).toEqual(1);
    const returnedOperation = returnedOperations[0];

    expect(returnedOperation.transactionNumber).toBeDefined();
    expect(returnedOperation.transactionNumber!).toEqual(transactionNumber);
    expect(returnedOperation.operationIndex).toBeDefined();
    expect(returnedOperation.operationIndex!).toEqual(operationIndex);
    expect(returnedOperation.transactionTime).toBeDefined();
    expect(returnedOperation.transactionTime!).toEqual(transactionTime);
    expect(returnedOperation.getDidUniqueSuffix()).toEqual(createOperation.getDidUniqueSuffix());
    expect(returnedOperation.getOperationHash()).toEqual(updateOperateion.getOperationHash());
  });
});
