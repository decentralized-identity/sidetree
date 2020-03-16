import BatchFileModel from './models/BatchFileModel';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import timeSpan = require('time-span');
import RecoverOperation from './RecoverOperation';
import UpdateOperation from './UpdateOperation';

/**
 * Defines the schema of a Batch File and its related operations.
 * NOTE: Must NOT add properties not defined by Sidetree protocol.
 */
export default class BatchFile {
  /**
   * Parses and validates the given batch file buffer and all the operations within it.
   * @throws SidetreeError if failed parsing or validation.
   */
  public static async parse (
    batchFileBuffer: Buffer
  ): Promise<BatchFileModel> {

    let endTimer = timeSpan();
    const decompressedBatchFileBuffer = await Compressor.decompress(batchFileBuffer);
    const batchFileObject = await JsonAsync.parse(decompressedBatchFileBuffer);
    console.info(`Parsed batch file in ${endTimer.rounded()} ms.`);

    // Ensure only properties specified by Sidetree protocol are given.
    const allowedProperties = new Set(['operationData']);
    for (let property in batchFileObject) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.BatchFileUnexpectedProperty, `Unexpected property ${property} in batch file.`);
      }
    }

    // Make sure operationData is an array.
    if (!(batchFileObject.operationData instanceof Array)) {
      throw new SidetreeError(ErrorCode.BatchFileOperationDataPropertyNotArray, 'Invalid batch file, operationData property is not an array.');
    }

    // Make sure all operations are strings.
    batchFileObject.operationData.forEach((operation: any) => {
      if (typeof operation !== 'string') {
        throw new SidetreeError(ErrorCode.BatchFileOperationDataNotArrayOfStrings, 'Invalid batch file, operationData property is not an array of strings.');
      }
    });

    const batchFileModel = batchFileObject as BatchFileModel;

    for (const encodedOperationData of batchFileModel.operationData) {
      const operationDataBuffer = Buffer.from(encodedOperationData);

      // Verify size of each operation data entry does not exceed the maximum allowed limit.
      if (operationDataBuffer.length > ProtocolParameters.maxOperationDataSizeInBytes) {
        throw new SidetreeError(
          ErrorCode.BatchFileOperationDataSizeExceedsLimit,
          `Operation size of ${operationDataBuffer.length} bytes exceeds the allowed limit of ${ProtocolParameters.maxOperationDataSizeInBytes} bytes.`
        );
      }
    }

    return batchFileModel;
  }

  /**
   * Creates batch file buffer.
   */
  public static async createBuffer (createOperations: CreateOperation[], recoverOperations: RecoverOperation[], updateOperations: UpdateOperation[]) {
    const operationData = [];
    operationData.push(...createOperations.map(operation => operation.encodedOperationData!));
    operationData.push(...recoverOperations.map(operation => operation.encodedOperationData!));
    operationData.push(...updateOperations.map(operation => operation.encodedOperationData!));

    const batchFileModel = {
      operationData
    };

    const rawData = Buffer.from(JSON.stringify(batchFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}
