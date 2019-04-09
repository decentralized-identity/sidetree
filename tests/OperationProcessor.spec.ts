import BatchFile from '../src/BatchFile';
import Cryptography from '../src/lib/Cryptography';
import Document from '../src/lib/Document';
import MockCas from './mocks/MockCas';
import MockOperationStore from './mocks/MockOperationStore';
import OperationGenerator from './generators/OperationGenerator';
import OperationProcessor from '../src/OperationProcessor';
import { Cas } from '../src/Cas';
import { Config, ConfigKey } from '../src/Config';
import { OperationStore } from '../src/OperationStore';
import { Operation } from '../src/Operation';
import { initializeProtocol } from '../src/Protocol';

/**
 * Creates a batch file with single operation given operation buffer,
 * then adds the batch file to the given CAS.
 * @returns The operation in the batch file added in the form of a Operation.
 */
async function addBatchFileOfOneOperationToCas (
  opBuf: Buffer,
  cas: Cas,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<Operation> {
  const operations: Buffer[] = [ opBuf ];
  const batchBuffer = BatchFile.fromOperations(operations).toBuffer();
  const batchFileAddress = await cas.write(batchBuffer);
  const resolvedTransaction = {
    transactionNumber,
    transactionTime,
    transactionTimeHash: 'unused',
    anchorFileHash: 'unused',
    batchFileHash: batchFileAddress
  };

  const op = Operation.create(opBuf, resolvedTransaction, operationIndex);
  return op;
}

async function createUpdateSequence (
  didUniqueSuffix: string,
  createOp: Operation,
  cas: Cas,
  numberOfUpdates:
  number,
  privateKey: any): Promise<Operation[]> {

  const ops = new Array(createOp);
  const opHashes = new Array(createOp.getOperationHash());

  for (let i = 0; i < numberOfUpdates; ++i) {
    const mostRecentVersion = opHashes[i];
    const updatePayload = {
      didUniqueSuffix,
      operationNumber: i + 1,
      previousOperationHash: mostRecentVersion,
      patch: [{
        op: 'replace',
        path: '/publicKey/1',
        value: {
          id: '#key2',
          type: 'RsaVerificationKey2018',
          owner: 'did:sidetree:updateid' + i,
          publicKeyPem: process.hrtime() // Some dummy value that's not used.
        }
      }]
    };

    const updateOperationBuffer = await OperationGenerator.generateUpdateOperation(updatePayload, '#key1', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(
      updateOperationBuffer,
      cas,
      i + 1,   // transaction Number
      i + 1,   // transactionTime
      0        // operation index
      );
    ops.push(updateOp);

    const updateOpHash = updateOp.getOperationHash();
    opHashes.push(updateOpHash);
  }

  return ops;
}

function getFactorial (n: number): number {
  let factorial = 1;
  for (let i = 2 ; i <= n ; ++i) {
    factorial *= i;
  }
  return factorial;
}

// Return a permutation of a given size with a specified index among
// all possible permutations. For example, there are 5! = 120 permutations
// of size 5, so by passing index values 0..119 we can enumerate all
// permutations
function getPermutation (size: number, index: number): Array<number> {
  const permutation: Array<number> = [];

  for (let i = 0 ; i < size ; ++i) {
    permutation.push(i);
  }

  for (let i = 0 ; i < size ; ++i) {
    const j = i + Math.floor(index / getFactorial(size - i - 1));
    index = index % getFactorial(size - i - 1);

    const t = permutation[i];
    permutation[i] = permutation[j];
    permutation[j] = t;
  }

  return permutation;
}

describe('OperationProcessor', async () => {
  initializeProtocol('protocol-test.json');

  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  let cas = new MockCas();
  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);
  let operationProcessor: OperationProcessor;
  let operationStore: OperationStore;
  let createOp: Operation | undefined;
  let publicKey: any;
  let privateKey: any;
  let didUniqueSuffix: string;

  beforeEach(async () => {
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.

    cas = new MockCas();
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config[ConfigKey.DidMethodName], operationStore); // TODO: add a clear method to avoid double initialization.

    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    createOp = await addBatchFileOfOneOperationToCas(createOperationBuffer, cas, 0, 0, 0);
    didUniqueSuffix = createOp.getOperationHash();
  });

  it('should return a DID Document for resolve(did) for a registered DID', async () => {
    await operationProcessor.processBatch([createOp!]);
    const didDocument = await operationProcessor.resolve(didUniqueSuffix);

    // This is a poor man's version based on public key properties
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined();
  });

  it('should process updates correctly', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    for (let i = 0 ; i < ops.length ; ++i) {
      await operationProcessor.processBatch([ops[i]]);
    }

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));
  });

  it('should correctly process updates in reverse order', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    for (let i = numberOfUpdates ; i >= 0 ; --i) {
      await operationProcessor.processBatch([ops[i]]);
    }
    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const numberOfUpdates = 4;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    const numberOfOps = ops.length;
    let numberOfPermutations = getFactorial(numberOfOps);

    for (let i = 0 ; i < numberOfPermutations; ++i) {
      const permutation = getPermutation(numberOfOps, i);
      operationStore = new MockOperationStore();
      operationProcessor = new OperationProcessor(config[ConfigKey.DidMethodName], operationStore);
      const permutedOps = permutation.map(i => ops[i]);
      await operationProcessor.processBatch(permutedOps);
      const didDocument = await operationProcessor.resolve(didUniqueSuffix);
      expect(didDocument).toBeDefined();
      const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
      expect(publicKey2).toBeDefined();
      expect(publicKey2!.owner).toBeDefined();
      expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));
    }
  });

  it('should not resolve the DID if its create operation failed signature validation.', async () => {
    // Generate a create operation with an invalid signature.
    const [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1');
    const operation = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
    operation.signature = 'AnInvalidSignature';

    // Create and upload the batch file with the invalid operation.
    const operationBuffer = Buffer.from(JSON.stringify(operation));
    const createOperation = await addBatchFileOfOneOperationToCas(operationBuffer, cas, 1, 0, 0);

    // Trigger processing of the operation.
    await operationProcessor.processBatch([createOperation]);
    const didUniqueSuffix = createOperation.getOperationHash();

    // Attempt to resolve the DID and validate the outcome.
    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });
});
