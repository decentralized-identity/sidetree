import IOperationQueue from '../../lib/core/versions/latest/interfaces/IOperationQueue';
import QueuedOperationModel from '../../lib/core/versions/latest/models/QueuedOperationModel';

/**
 * A mock in-memory operation queue used by the Batch Writer.
 */
export default class MockOperationQueue implements IOperationQueue {
  private latestTimestamp = 0;
  private operations: Map<string, [number, Buffer]> = new Map();

  async enqueue (didUniqueSuffix: string, operationBuffer: Buffer) {
    this.latestTimestamp++;
    this.operations.set(didUniqueSuffix, [this.latestTimestamp, operationBuffer]);
  }

  async dequeue (count: number): Promise<QueuedOperationModel[]> {
    // Sort the entries by their timestamp.
    // If compare function returns < 0, a is before b, vice versa.
    const sortedEntries = Array.from(this.operations.entries()).sort((a, b) => a[1][0] - b[1][0]);
    const sortedQueuedOperations = sortedEntries.map(entry => {
      return { didUniqueSuffix: entry[0], operationBuffer: entry[1][1] };
    });

    const sortedKeys = sortedEntries.map(entry => entry[0]);
    const keyBatch = sortedKeys.slice(0, count);
    keyBatch.forEach((key) => this.operations.delete(key));

    const operationBatch = sortedQueuedOperations.slice(0, count);
    return operationBatch;
  }

  async peek (count: number): Promise<QueuedOperationModel[]> {
    // Sort the entries by their timestamp.
    const sortedEntries = Array.from(this.operations.entries()).sort((a, b) => a[1][0] - b[1][0]);
    const sortedQueuedOperations = sortedEntries.map(entry => {
      return { didUniqueSuffix: entry[0], operationBuffer: entry[1][1] };
    });

    const operationBatch = sortedQueuedOperations.slice(0, count);
    return operationBatch;
  }

  async contains (didUniqueSuffix: string): Promise<boolean> {
    return this.operations.has(didUniqueSuffix);
  }

  async getSize (): Promise<number> {
    return this.operations.size;
  }
}
