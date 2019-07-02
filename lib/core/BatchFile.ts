import Encoder from './Encoder';
import IResolvedTransaction from './interfaces/IResolvedTransaction';
import JsonAsync from './util/JsonAsync';
import ProtocolParameters from './ProtocolParameters';
import timeSpan = require('time-span');
import { IAnchorFile } from './AnchorFile';
import { Operation } from './Operation';

/**
 * Defines Batch File structure.
 */
export interface IBatchFile {
  operations: string[];
}

/**
 * Defines the schema of a Batch File and its related operations.
 * NOTE: Must NOT add properties not defined by Sidetree protocol.
 */
export default class BatchFile {
  /**
   * Parses and validates the given batch file buffer and all the operations within it.
   * @throws Error if failed parsing or validation.
   */
  public static async parseAndValidate (batchFileBuffer: Buffer, anchorFile: IAnchorFile, resolvedTransaction: IResolvedTransaction): Promise<Operation[]> {
    let endTimer = timeSpan();
    const batchFileObject = await JsonAsync.parse(batchFileBuffer);
    console.info(`Parsed batch file ${anchorFile.batchFileHash} in ${endTimer.rounded()} ms.`);

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

    const batchFile = batchFileObject as IBatchFile;
    const batchSize = batchFile.operations.length;

    // Verify the number of operations does not exceed the maximum allowed limit.
    const protocol = ProtocolParameters.get(resolvedTransaction.transactionTime);
    if (batchSize > protocol.maxOperationsPerBatch) {
      throw Error(`Batch size of ${batchSize} operations exceeds the allowed limit of ${protocol.maxOperationsPerBatch}.`);
    }

    // Verify that the batch size count matches that of the anchor file.
    const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
    if (batchSize !== operationCountInAnchorFile) {
      throw Error(`Batch size of ${batchSize} in batch file '${anchorFile.batchFileHash}' does not size of ${operationCountInAnchorFile} in anchor file.`);
    }

    endTimer = timeSpan();
    const operations: Operation[] = new Array<Operation>(batchSize);
    for (let operationIndex = 0; operationIndex < batchSize; operationIndex++) {
      const encodedOperation = batchFile.operations[operationIndex];
      const operationBuffer = Encoder.decodeAsBuffer(encodedOperation);

      // Verify size of each operation does not exceed the maximum allowed limit.
      if (operationBuffer.length > protocol.maxOperationByteSize) {
        throw Error(`Operation size of ${operationBuffer.length} bytes exceeds the allowed limit of ${protocol.maxOperationByteSize} bytes.`);
      }

      let operation;
      try {
        operation = Operation.createAnchoredOperation(operationBuffer, resolvedTransaction, operationIndex);
      } catch (error) {
        console.info(`Unable to create an Operation object with '${operationBuffer}': ${error}`);
        throw error;
      }

      const didUniqueSuffixesInAnchorFile = anchorFile.didUniqueSuffixes[operationIndex];
      if (operation.didUniqueSuffix !== didUniqueSuffixesInAnchorFile) {
        console.info(`Operation ${operationIndex}'s DID unique suffix '${operation.didUniqueSuffix}' ` +
                     `is not the same as '${didUniqueSuffixesInAnchorFile}' seen in anchor file.`);
      }

      operations[operationIndex] = operation;
    }
    console.info(`Decoded ${operations.length} operations in batch ${resolvedTransaction.batchFileHash}. Time taken: ${endTimer.rounded()} ms.`);

    return operations;
  }

  /**
   * Creates the Batch File buffer from an array of operation Buffers.
   * @param operationBuffers Operation buffers in JSON serialized form, NOT encoded in anyway.
   * @returns The Batch File buffer.
   */
  public static fromOperationBuffers (operationBuffers: Buffer[]): Buffer {
    const operations = operationBuffers.map((operation) => {
      return Encoder.encode(operation);
    });

    return Buffer.from(JSON.stringify({ operations }));
  }
}
