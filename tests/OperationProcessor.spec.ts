import * as Base58 from 'bs58';
import BatchFile from '../src/BatchFile';
import MockCas from './mocks/MockCas';
import Multihash from '../src/Multihash';
import { Cas } from '../src/Cas';
import { createOperationProcessor } from '../src/OperationProcessor';
import { readFileSync } from 'fs';
import { OperationType, WriteOperation } from '../src/Operation';

function createCreateOperationBuffer (): Buffer {
  const createOpRequest = JSON.parse(readFileSync('./tests/requests/create.json').toString());
  return Buffer.from(JSON.stringify(createOpRequest));
}

function createUpdateOperationBuffer (previousOperationHash: string): Buffer {
  const updateOpJson = {
    'add': 'some path',
    previousOperationHash
  };
  const updatePayload = Base58.encode(Buffer.from(JSON.stringify(updateOpJson)));
  const updateOpRequest = {
    updatePayload,
    signature: 'signature',
    proofOfWork: 'proof of work'
  };
  return Buffer.from(JSON.stringify(updateOpRequest));
}

/**
 * Creates a batch file with single operation given operation buffer,
 * then adds the batch file to the given CAS.
 * @returns The operation in the batch file added in the form of a WriteOperation.
 */
async function addBatchFileOfOneOperationToCas (
  opBuf: Buffer,
  cas: Cas,
  transactionNumber: number,
  transactionTime: number,
  operationIndex: number): Promise<WriteOperation> {
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

  const op = WriteOperation.create(opBuf, resolvedTransaction, operationIndex);
  return op;
}

function getHash (operation: WriteOperation): string {
  const sha256HashCode = 18;

  let contentBuffer;
  if (operation.type === OperationType.Create) {
    contentBuffer = Buffer.from(operation.encodedPayload);
  } else {
    contentBuffer = operation.operationBuffer;
  }

  const multihash = Multihash.hash(contentBuffer, sha256HashCode);
  const multihashBase58 = Base58.encode(multihash);
  return multihashBase58;
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
  let permutation: Array<number> = [];

  for (let i = 0 ; i < size ; ++i) {
    permutation.push(i);
  }

  for (let i = 0 ; i < size ; ++i) {
    let j = i + Math.floor(index / getFactorial(size - i - 1));
    index = index % getFactorial(size - i - 1);

    let t = permutation[i];
    permutation[i] = permutation[j];
    permutation[j] = t;
  }

  return permutation;
}

describe('OperationProessor', async () => {

  let cas = new MockCas();
  let operationProcessor = createOperationProcessor(cas, 'did:sidetree:');
  let createOp: WriteOperation | undefined;
  let firstVersion: string | undefined;

  beforeEach(async () => {
    cas = new MockCas();
    operationProcessor = createOperationProcessor(cas, 'did:sidetree:'); // TODO: add a clear method to avoid double initialization.
    createOp = await addBatchFileOfOneOperationToCas(createCreateOperationBuffer(), cas, 0, 0, 0);
    firstVersion = operationProcessor.process(createOp);
  });

  it('should return operation hash for create op', async () => {
    const expectedHash = getHash(createOp!);
    expect(firstVersion).not.toBeUndefined();
    expect(firstVersion).toBe(expectedHash);
  });

  it('should return firstVersion for first(firstVersion)', async () => {
    const firstOfFirstVersion = await operationProcessor.first(firstVersion!);
    expect(firstOfFirstVersion).toBe(firstVersion!);
  });

  it('should return firstVersion for last(firstVersion) if firstVersion is the only version', async () => {
    expect(await operationProcessor.last(firstVersion!)).toBe(firstVersion!);
  });

  it('should return undefined for prev(firstVersion)', async () => {
    const prev = await operationProcessor.previous(firstVersion!);
    expect(prev).toBeUndefined();
  });

  it('should return provided document for resolve(firstVersion)', async () => {
    const resolvedDid = await operationProcessor.resolve(firstVersion!);
    // TODO: can we get the raw json from did? if so, we can write a better test.
    expect(resolvedDid).not.toBeUndefined();
  });

  it('should process updates correctly', async () => {
    // Update firstVersion several times, store the resulting versions in an array
    const versions = new Array(firstVersion!);
    const numberOfUpdates = 10;
    for (let i = 0; i < numberOfUpdates; ++i) {
      const mostRecentVersion = versions[i];
      const updateOp = await addBatchFileOfOneOperationToCas(createUpdateOperationBuffer(
        mostRecentVersion),
        cas,
        i + 1,   // transaction Number
        i + 1,   // transactionTime
        0        // operation index
        );
      const newVersion = operationProcessor.process(updateOp);
      expect(newVersion).not.toBeUndefined();
      expect(newVersion!).toBe(getHash(updateOp));
      versions.push(newVersion!);
    }

    // Check first(), last(), prev(), next() return expected outputs
    for (let i = 0; i < versions.length; ++i) {
      expect(await operationProcessor.first(versions[i])).toBe(versions[0]);
      expect(await operationProcessor.last(versions[i])).toBe(versions[versions.length - 1]);

      if (i === 0) {
        expect(await operationProcessor.previous(versions[i])).toBeUndefined();
      } else {
        expect(await operationProcessor.previous(versions[i])).toBe(versions[i - 1]);
      }
      if (i === versions.length - 1) {
        expect(await operationProcessor.next(versions[i])).toBeUndefined();
      } else {
        expect(await operationProcessor.next(versions[i])).toBe(versions[i + 1]);
      }
    }
  });

  it('should correctly process updates in reverse order', async () => {
    const ops = new Array(createOp!);
    const opHashes = new Array(getHash(createOp!));

    // Add batch files that makes up a logical update operation chain to CAS
    // and store each operation and its operation hash in an arary for later access.
    const numberOfUpdates = 10;
    for (let i = 0; i < numberOfUpdates; ++i) {
      const mostRecentVersion = opHashes[i];
      const updateOp = await addBatchFileOfOneOperationToCas(createUpdateOperationBuffer(
        mostRecentVersion),
        cas,
        i + 1,   // transaction Number
        i + 1,   // transactionTime
        0        // operation index
        );
      ops.push(updateOp);

      const updateOpHash = getHash(updateOp);
      opHashes.push(updateOpHash);
    }

    // Process the operations in reverse order.
    for (let i = numberOfUpdates ; i > 0 ; --i) {
      const newVersion = operationProcessor.process(ops[i]);
      expect(newVersion).toBeDefined();
      expect(newVersion!).toBe(opHashes[i]);
    }

    // Check first(), last(), prev(), next() return expected outputs. Since
    // if the OperationProcessor did not process the operations correctly
    // some version defined by these operations would be "invalid" and we would
    // not get the correct output below.
    for (let i = 0; i < opHashes.length; ++i) {
      expect(await operationProcessor.first(opHashes[i])).toBe(opHashes[0]);
      expect(await operationProcessor.last(opHashes[i])).toBe(opHashes[opHashes.length - 1]);

      if (i === 0) {
        expect(await operationProcessor.previous(opHashes[i])).toBeUndefined();
      } else {
        expect(await operationProcessor.previous(opHashes[i])).toBe(opHashes[i - 1]);
      }
      if (i === opHashes.length - 1) {
        expect(await operationProcessor.next(opHashes[i])).toBeUndefined();
      } else {
        expect(await operationProcessor.next(opHashes[i])).toBe(opHashes[i + 1]);
      }
    }
  });

  it('should correctly process updates in every (5! = 120) order', async () => {
    const ops = new Array(createOp!);
    const opHashes = new Array(getHash(createOp!));

    const numberOfUpdates = 4;
    for (let i = 0; i < numberOfUpdates; ++i) {
      const mostRecentVersion = opHashes[i];
      const updateOp = await addBatchFileOfOneOperationToCas(createUpdateOperationBuffer(
        mostRecentVersion),
        cas,
        i + 1,   // transaction Number
        i + 1,   // transactionTime
        0        // operation index
        );
      ops.push(updateOp);

      const updateOpHash = getHash(updateOp);
      opHashes.push(updateOpHash);
    }

    const numberOfOps = ops.length;
    const numberOfPermutations = getFactorial(numberOfOps);
    for (let i = 0 ; i < numberOfPermutations; ++i) {
      const permutation = getPermutation(numberOfOps, i);
      operationProcessor = createOperationProcessor(cas, 'did:sidetree:'); // Reset

      for (let i = 0 ; i < numberOfOps ; ++i) {
        const opIdx = permutation[i];
        const newVersion = operationProcessor.process(ops[opIdx]);
        expect(newVersion).toBeDefined();
        expect(newVersion!).toBe(opHashes[opIdx]);
      }

      // Check first(), last(), prev(), next() return expected outputs. Since
      // if the OperationProcessor did not process the operations correctly
      // some version defined by these operations would be "invalid" and we would
      // not get the correct output below.
      for (let i = 0; i < numberOfOps; ++i) {
        expect(await operationProcessor.first(opHashes[i])).toBe(opHashes[0]);
        expect(await operationProcessor.last(opHashes[i])).toBe(opHashes[opHashes.length - 1]);

        if (i === 0) {
          expect(await operationProcessor.previous(opHashes[i])).toBeUndefined();
        } else {
          expect(await operationProcessor.previous(opHashes[i])).toBe(opHashes[i - 1]);
        }
        if (i === opHashes.length - 1) {
          expect(await operationProcessor.next(opHashes[i])).toBeUndefined();
        } else {
          expect(await operationProcessor.next(opHashes[i])).toBe(opHashes[i + 1]);
        }
      }
    }
  });
});
