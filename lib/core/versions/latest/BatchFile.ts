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
    const allowedProperties = new Set(['patchSet']);
    for (let property in batchFileObject) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.BatchFileUnexpectedProperty, `Unexpected property ${property} in batch file.`);
      }
    }

    // Make sure patchSet is an array.
    if (!(batchFileObject.patchSet instanceof Array)) {
      throw new SidetreeError(ErrorCode.BatchFilePatchSetPropertyNotArray, 'Invalid batch file, patchData property is not an array.');
    }

    // Make sure all operations are strings.
    batchFileObject.patchSet.forEach((operation: any) => {
      if (typeof operation !== 'string') {
        throw new SidetreeError(ErrorCode.BatchFilePatchSetNotArrayOfStrings, 'Invalid batch file, patchData property is not an array of strings.');
      }
    });

    const batchFileModel = batchFileObject as BatchFileModel;

    for (const encodedPatchData of batchFileModel.patchSet) {
      const patchDataBuffer = Buffer.from(encodedPatchData);

      // Verify size of each patch data entry does not exceed the maximum allowed limit.
      if (patchDataBuffer.length > ProtocolParameters.maxPatchDataSizeInBytes) {
        throw new SidetreeError(
          ErrorCode.BatchFilePatchDataSizeExceedsLimit,
          `Operation size of ${patchDataBuffer.length} bytes exceeds the allowed limit of ${ProtocolParameters.maxPatchDataSizeInBytes} bytes.`
        );
      }
    }

    return batchFileModel;
  }

  /**
   * Creates batch file buffer.
   */
  public static async createBuffer (createOperations: CreateOperation[], recoverOperations: RecoverOperation[], updateOperations: UpdateOperation[]) {
    const patchSet = [];
    patchSet.push(...createOperations.map(operation => operation.encodedPatchData!));
    patchSet.push(...recoverOperations.map(operation => operation.encodedPatchData!));
    patchSet.push(...updateOperations.map(operation => operation.encodedPatchData!));

    const batchFileModel = {
      patchSet
    };

    const rawData = Buffer.from(JSON.stringify(batchFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}
