import OperationQueue from '../../lib/core/OperationQueue';

/**
 * A mock in-memory operation queue used by the Batch Writer.
 */
export default class MockOperationQueue implements OperationQueue {
  private latestTimestamp = 0;
  private operations: Map<string, [number, Buffer]> = new Map();

  async enqueue (didUniqueSuffix: string, operationBuffer: Buffer) {
    this.latestTimestamp++;
    this.operations.set(didUniqueSuffix, [this.latestTimestamp, operationBuffer]);
  }

  async dequeue (count: number): Promise<Buffer[]> {
    // Sort the entries by their timestamp.
    const sortedEntries = Array.from(this.operations.entries()).sort((a, b) => b[1][0] - a[1][0]);
    const sortedKeys = sortedEntries.map(entry => entry[0]);
    const sortedBuffers = sortedEntries.map(entry => entry[1][1]);

    const bufferBatch = sortedBuffers.slice(0, count);
    const keyBatch = sortedKeys.slice(0, count);
    keyBatch.forEach((key) => this.operations.delete(key));

    return bufferBatch;
  }

  async peek (count: number): Promise<Buffer[]> {
    // Sort the entries by their timestamp.
    const sortedValues = Array.from(this.operations.values()).sort((a, b) => b[0] - a[0]);
    const sortedBuffers = sortedValues.map(entry => entry[1]);

    const bufferBatch = sortedBuffers.slice(0, count);
    return bufferBatch;
  }

  async contains (didUniqueSuffix: string): Promise<boolean> {
    return this.operations.has(didUniqueSuffix);
  }
}
