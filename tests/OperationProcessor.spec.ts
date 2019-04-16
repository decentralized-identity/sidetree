import BatchFile from '../lib/BatchFile';
import Cryptography from '../lib/util/Cryptography';
import Document from '../lib/util/Document';
import MockCas from './mocks/MockCas';
import MockOperationStore from './mocks/MockOperationStore';
import OperationGenerator from './generators/OperationGenerator';
import OperationProcessor from '../lib/OperationProcessor';
import ProtocolParameters from '../lib/ProtocolParameters';
import { Cas } from '../lib/Cas';
import { OperationStore } from '../lib/OperationStore';
import { Operation } from '../lib/Operation';

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

    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
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
  const versionsOfProtocolParameters = require('../json/protocol-parameters-test.json');
  ProtocolParameters.initialize(versionsOfProtocolParameters);

  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  let cas = new MockCas();
  const config = require('../json/config-test.json');
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
    operationProcessor = new OperationProcessor(config.didMethodName, operationStore); // TODO: add a clear method to avoid double initialization.

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

  it('should ignore a duplicate create operation', async () => {
    await operationProcessor.processBatch([createOp!]);

    // Create and process a duplicate create op
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    const duplicateCreateOp = await addBatchFileOfOneOperationToCas(createOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([duplicateCreateOp]);

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
    await operationProcessor.processBatch(ops);

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
      operationProcessor = new OperationProcessor(config.didMethodName, operationStore);
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

  it('should return undefined for deleted did', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationProcessor.processBatch(ops);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));

    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationProcessor.processBatch([deleteOperation]);

    const didDocumentAfterDelete = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocumentAfterDelete).toBeUndefined();
  });

  it('should not resolve the DID if its create operation contains invalid key id.', async () => {
    // Generate a create operation with an invalid signature.
    const [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1');
    const operation = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
    operation.header.kid = 'InvalidKeyId';

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

  it('should return undefined for deleted did', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationProcessor.processBatch(ops);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));

    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, numberOfUpdates + 1, numberOfUpdates + 1, 0);
    await operationProcessor.processBatch([deleteOperation]);

    const didDocumentAfterDelete = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocumentAfterDelete).toBeUndefined();
  });

  it('should ignore delete operations of a non-existent did', async () => {
    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([deleteOperation]);

    const didDocumentAfterDelete = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocumentAfterDelete).toBeUndefined();
  });

  it('should ignore delete operations with invalid signing key id', async () => {
    await operationProcessor.processBatch([createOp!]);

    const deleteOperationBuffer = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, 'InvalidKeyId', privateKey);
    const deleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([deleteOperation]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined();
  });

  it('should ignore delete operations with invalid signature', async () => {
    await operationProcessor.processBatch([createOp!]);

    const deleteOperation = await OperationGenerator.generateDeleteOperation(didUniqueSuffix, '#key1', privateKey);
    deleteOperation.signature = 'InvalidSignature';
    const deleteOperationBuffer = Buffer.from(JSON.stringify(deleteOperation));
    const anchoredDeleteOperation = await addBatchFileOfOneOperationToCas(deleteOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([anchoredDeleteOperation]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined();
  });

  it('should ignore updates to did that is not created', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);

    // elide i = 0, the create operation
    for (let i = 1 ; i < ops.length ; ++i) {
      await operationProcessor.processBatch([ops[i]]);
    }

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeUndefined();
  });

  it('should ignore update operation without a previous operation hash', async () => {
    await operationProcessor.processBatch([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
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

    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#key1', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([updateOp]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);

    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined(); // if update above went through, the owner would be defined
  });

  it('should ignore update operation with an invalid key id', async () => {
    await operationProcessor.processBatch([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.getOperationHash(),
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

    // Generate operation with an invalid key
    const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, '#InvalidKeyId', privateKey);
    const updateOp = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([updateOp]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);

    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined(); // if update above went through, the owner would be defined
  });

  it('should ignore update operation with an invalid signature', async () => {
    await operationProcessor.processBatch([createOp!]);

    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.getOperationHash(),
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

    // Generate operation with an invalid key
    const updateOperation = await OperationGenerator.generateUpdateOperation(updatePayload, '#key1', privateKey);
    updateOperation.signature = 'InvalidSignature';
    const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperation));
    const anchoredUpdateOperation = await addBatchFileOfOneOperationToCas(updateOperationBuffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([anchoredUpdateOperation]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);

    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeUndefined(); // if update above went through, the owner would be defined
  });

  it('should pick earlier of two conflicting updates', async () => {
    await operationProcessor.processBatch([createOp!]);

    const update1Payload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.getOperationHash(),
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

    const update2Payload = {
      didUniqueSuffix,
      previousOperationHash: createOp!.getOperationHash(),
      patch: [{
        op: 'replace',
        path: '/publicKey/1',
        value: {
          id: '#key2',
          type: 'RsaVerificationKey2018',
          owner: 'did:sidetree:updateid2',
          publicKeyPem: process.hrtime() // Some dummy value that's not used.
        }
      }]
    };

    const updateOperation1Buffer = await OperationGenerator.generateUpdateOperationBuffer(update1Payload, '#key1', privateKey);
    const updateOperation1 = await addBatchFileOfOneOperationToCas(updateOperation1Buffer, cas, 1, 1, 0);
    await operationProcessor.processBatch([updateOperation1]);

    const updateOperation2Buffer = await OperationGenerator.generateUpdateOperationBuffer(update2Payload, '#key1', privateKey);
    const updateOperation2 = await addBatchFileOfOneOperationToCas(updateOperation2Buffer, cas, 2, 2, 0);
    await operationProcessor.processBatch([updateOperation2]);

    const didDocument = await operationProcessor.resolve(didUniqueSuffix);

    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid1');
  });

  it('should rollback all', async () => {
    const numberOfUpdates = 10;
    const ops = await createUpdateSequence(didUniqueSuffix, createOp!, cas, numberOfUpdates, privateKey);
    await operationProcessor.processBatch(ops);
    const didDocument = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocument).toBeDefined();
    const publicKey2 = Document.getPublicKey(didDocument!, 'key2');
    expect(publicKey2).toBeDefined();
    expect(publicKey2!.owner).toBeDefined();
    expect(publicKey2!.owner!).toEqual('did:sidetree:updateid' + (numberOfUpdates - 1));

    // rollback
    await operationProcessor.rollback();
    const didDocumentAfterRollback = await operationProcessor.resolve(didUniqueSuffix);
    expect(didDocumentAfterRollback).toBeUndefined();
  });
});
