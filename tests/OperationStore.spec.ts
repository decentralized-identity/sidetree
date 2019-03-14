import { Config } from '../src/Config';
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
  let operationStore: OperationStore;
  let publicKey: any;
  let privateKey: any;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.
    operationStore = createOperationStore(config);
    await operationStore.initialize(false);
  });

  it('should get a put operation', async () => {
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
  });
});
