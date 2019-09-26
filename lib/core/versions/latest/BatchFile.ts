import AnchoredOperation from './AnchoredOperation';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import AnchorFileModel from './models/AnchorFileModel';
import BatchFileModel from './models/BatchFileModel';
import Compressor from './util/Compressor';
import Encoder from './Encoder';
import JsonAsync from './util/JsonAsync';
import NamedAnchoredOperationModel from '../../models/NamedAnchoredOperationModel';
import ProtocolParameters from './ProtocolParameters';
import timeSpan = require('time-span');

/**
 * Defines the schema of a Batch File and its related operations.
 * NOTE: Must NOT add properties not defined by Sidetree protocol.
 */
export default class BatchFile {
  /**
   * Parses and validates the given batch file buffer and all the operations within it.
   * @throws Error if failed parsing or validation.
   */
  public static async parseAndValidate (
    batchFileBuffer: Buffer,
    anchorFile: AnchorFileModel,
    transactionNumber: number,
    transactionTime: number
  ): Promise<NamedAnchoredOperationModel[]> {

    let endTimer = timeSpan();
    const decompressedBatchFileBuffer = await Compressor.decompressBuffer(batchFileBuffer);
    const batchFileObject = await JsonAsync.parse(decompressedBatchFileBuffer);
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

    const batchFile = batchFileObject as BatchFileModel;
    const batchSize = batchFile.operations.length;

    // Verify the number of operations does not exceed the maximum allowed limit.
    if (batchSize > ProtocolParameters.maxOperationsPerBatch) {
      throw new Error(`Batch size of ${batchSize} operations exceeds the allowed limit of ${ProtocolParameters.maxOperationsPerBatch}.`);
    }

    // Verify that the batch size count matches that of the anchor file.
    const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
    if (batchSize !== operationCountInAnchorFile) {
      throw new Error(`Batch size of ${batchSize} in batch file '${anchorFile.batchFileHash}' does not size of ${operationCountInAnchorFile} in anchor file.`);
    }

    endTimer = timeSpan();
    const namedAnchoredOperationModels: NamedAnchoredOperationModel[] = [];

    for (let operationIndex = 0; operationIndex < batchSize; operationIndex++) {
      const encodedOperation = batchFile.operations[operationIndex];
      const operationBuffer = Encoder.decodeAsBuffer(encodedOperation);

      // Verify size of each operation does not exceed the maximum allowed limit.
      if (operationBuffer.length > ProtocolParameters.maxOperationByteSize) {
        throw new Error(`Operation size of ${operationBuffer.length} bytes exceeds the allowed limit of ${ProtocolParameters.maxOperationByteSize} bytes.`);
      }

      const anchoredOperationModel: AnchoredOperationModel = {
        operationBuffer,
        operationIndex,
        transactionNumber,
        transactionTime
      };

      const operation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);

      const didUniqueSuffixesInAnchorFile = anchorFile.didUniqueSuffixes[operationIndex];
      if (operation.didUniqueSuffix !== didUniqueSuffixesInAnchorFile) {
        throw new Error(`Operation ${operationIndex}'s DID unique suffix '${operation.didUniqueSuffix}' ` +
                     `is not the same as '${didUniqueSuffixesInAnchorFile}' seen in anchor file.`);
      }

      namedAnchoredOperationModels.push(operation);
    }
    console.info(`Decoded ${batchSize} operations in batch ${anchorFile.batchFileHash}. Time taken: ${endTimer.rounded()} ms.`);

    return namedAnchoredOperationModels;
  }

  /**
   * Creates the Batch File buffer from an array of operation Buffers.
   * @param operationBuffers Operation buffers in JSON serialized form, NOT encoded in anyway.
   * @returns The Batch File buffer.
   */
  public static async fromOperationBuffers (operationBuffers: Buffer[]): Promise<Buffer> {
    const operations = operationBuffers.map((operation) => {
      return Encoder.encode(operation);
    });

    const rawData = JSON.stringify({ operations });
    const compressedRawData = await Compressor.compressAsBuffer(Buffer.from(rawData));

    return compressedRawData;
  }
}
