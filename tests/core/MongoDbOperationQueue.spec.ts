import Config from '../../lib/core/models/Config';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import IOperationQueue from '../../lib/core/versions/latest/interfaces/IOperationQueue';
import MongoDb from '../common/MongoDb';
import MongoDbOperationQueue from '../../lib/core/versions/latest/MongoDbOperationQueue';
import SidetreeError from '../../lib/core/SidetreeError';

/**
 * Creates a MongoDbOperationQueue and initializes it.
 */
async function createOperationQueue (transactionStoreUri: string, databaseName: string): Promise<MongoDbOperationQueue> {
  const operationQueue = new MongoDbOperationQueue(transactionStoreUri, databaseName);
  await operationQueue.initialize();
  return operationQueue;
}

/**
 * Generates the given count of operations and queues them in the given operation queue.
 * e.g. The DID unique suffix will start from '1', '2', '3'... and buffer will be generated from the DID unique suffix.
 */
async function generateAndQueueOperations (operationQueue: IOperationQueue, count: number): Promise<{ didUniqueSuffix: string, operationBuffer: Buffer }[]> {
  const operations: { didUniqueSuffix: string, operationBuffer: Buffer }[] = [];
  for (let i = 1; i <= count; i++) {
    const didUniqueSuffix = i.toString();
    const operationBuffer = Buffer.from(didUniqueSuffix);

    operations.push({ didUniqueSuffix, operationBuffer });
    await operationQueue.enqueue(didUniqueSuffix, operationBuffer);
  }

  return operations;
}

describe('MongoDbOperationQueue', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable = false;
  let operationQueue: MongoDbOperationQueue;
  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      operationQueue = await createOperationQueue(config.mongoDbConnectionString, databaseName);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await operationQueue.clearCollection();
  });

  it('should peek with correct count.', async () => {
    const operationCount = 3;
    const queuedOperations = await generateAndQueueOperations(operationQueue, operationCount);

    // Expect empty array if peeked with count 0.
    let peekedOperations = await operationQueue.peek(0);
    expect(peekedOperations).not.toBeNull();
    expect(peekedOperations.length).toBe(0);

    // Expected same result no matter how many times the queue is peeked.
    for (let i = 0; i < 5; i++) {
      peekedOperations = await operationQueue.peek(2);
      expect(peekedOperations.length).toEqual(2);
      expect(peekedOperations[0].toString()).toEqual(queuedOperations[0].operationBuffer.toString());
      expect(peekedOperations[1].toString()).toEqual(queuedOperations[1].operationBuffer.toString());
    }
  });

  it('should deqeueue with correct count.', async () => {
    const operationCount = 3;
    const queuedOperations = await generateAndQueueOperations(operationQueue, operationCount);

    // Expect empty array if peeked with count 0.
    let dequeuedOperations = await operationQueue.dequeue(0);
    expect(dequeuedOperations).not.toBeNull();
    expect(dequeuedOperations.length).toBe(0);

    dequeuedOperations = await operationQueue.dequeue(2);
    let remainingOperations = await operationQueue.peek(operationCount);
    expect(dequeuedOperations.length).toEqual(2);
    expect(dequeuedOperations[0].toString()).toEqual(queuedOperations[0].operationBuffer.toString());
    expect(dequeuedOperations[1].toString()).toEqual(queuedOperations[1].operationBuffer.toString());

    expect(remainingOperations.length).toEqual(1);
    expect(remainingOperations[0].toString()).toEqual(queuedOperations[2].operationBuffer.toString());
  });

  it('should check if an operation of the given DID unique suffix exists correctly.', async () => {
    const operationCount = 3;
    await generateAndQueueOperations(operationQueue, operationCount);

    for (let i = 1; i <= operationCount; i++) {
      const operationExists = await operationQueue.contains(i.toString());
      expect(operationExists).toBeTruthy();
    }

    const operationExists = await operationQueue.contains('non-existent-did-unique-suffix');
    expect(operationExists).toBeFalsy();
  });

  it('should throw SidetreeError with code when enqueueing more than 1 operation for DID.', async () => {
    const operationCount = 3;
    await generateAndQueueOperations(operationQueue, operationCount);

    spyOn((operationQueue as any).collection, 'insertOne').and.callFake(
      () => {
        const error = new Error(ErrorCode.BatchWriterAlreadyHasOperationForDid);
        (error as any)['code'] = 11000;
        throw error;
      }
    );

    try {
      await generateAndQueueOperations(operationQueue, operationCount);
    } catch (error) {
      if (error instanceof SidetreeError &&
          error.code === ErrorCode.BatchWriterAlreadyHasOperationForDid) {
        return; // Expected Sidetree error.
      } else {
        throw error; // Unexpected error, throw to fail the test.
      }
    }
  });

  it('should throw original error if unexpected error is thrown when enqueuing.', async () => {
    spyOn((operationQueue as any).collection, 'insertOne').and.callFake(
      () => {
        const error = new Error(ErrorCode.BatchWriterAlreadyHasOperationForDid);
        (error as any)['code'] = 'unexpected-error';
        throw error;
      }
    );

    try {
      await generateAndQueueOperations(operationQueue, 1);
    } catch (error) {
      if (error.code === 'unexpected-error') {
        return; // Expected behavior.
      } else {
        throw error; // Unexpected behavior, throw to fail the test.
      }
    }
  });
});
