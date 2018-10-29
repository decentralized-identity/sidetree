import * as Base58 from 'bs58';

/**
 * Defines the schema of a Batch File and its related operations.
 * NOTE: Must NOT add properties not defined by Sidetree protocol.
 */
export default class BatchFile {
  /** Operations included in this BatchFile. */
  public readonly operations: string[] = [];

  /**
   * BatchFile constructor.
   * @param operations List of operations, each of which is a Base58 encoded string as specificied by the Sidetree protocol.
   */
  private constructor (operations: string[]) {
    this.operations = operations;
  }

  /**
   * Gets the decoded raw buffer representing the operation specified by the operationIndex.
   */
  public getOperationBuffer (operationIndex: number): Buffer {
    return Buffer.from(Base58.decode(this.operations[operationIndex]));
  }

  /**
   * Converts this BatchFile into a JSON serialized buffer.
   */
  public toBuffer (): Buffer {
    return Buffer.from(JSON.stringify(this));
  }

  /**
   * Creates a BatchFile object from a batch file buffer.
   */
  public static fromBuffer (batchFileBuffer: Buffer): BatchFile {
    const batchFileObject = JSON.parse(batchFileBuffer.toString());

    // Ensure only properties specified by Sidetree protocol are given.
    const allowedProperties = new Set(['operations']);
    for (let property in batchFileObject) {
      if (!allowedProperties.has(property)) {
        throw new Error(`Unexpected property ${property} in batch file.`);
      }
    }

    // Make sure operations is an array.
    if (!(batchFileObject.operations instanceof Array)) {
      throw new Error('Invalid batch file, operations property is not an array.');
    }

    // Make sure all operations are strings.
    batchFileObject.operations.forEach((operation: any) => {
      if (typeof operation !== 'string') {
        throw new Error('Invalid batch file, operations property is not an array of strings.');
      }
    });

    return new BatchFile(batchFileObject.operations);
  }

  /**
   * Creates a BatchFile object an array of operation Buffers.
   * @param operations Operation buffers in JSON serialized form, NOT encoded in anyway.
   */
  public static fromOperations (operations: Buffer[]): BatchFile {
    const operationsBase58 = operations.map((operation) => {
      return Base58.encode(operation);
    });

    return new BatchFile(operationsBase58);

  }
}
