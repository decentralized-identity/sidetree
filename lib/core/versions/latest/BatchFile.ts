import BatchFileModel from './models/BatchFileModel';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import ProtocolParameters from './ProtocolParameters';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';
import timeSpan = require('time-span');
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
    const allowedProperties = new Set(['deltas']);
    for (let property in batchFileObject) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.BatchFileUnexpectedProperty, `Unexpected property ${property} in batch file.`);
      }
    }

    this.validateDeltasProperty(batchFileObject.deltas);

    return batchFileObject;
  }

  private static validateDeltasProperty (deltas: any) {
    // Make sure deltas is an array.
    if (!(deltas instanceof Array)) {
      throw new SidetreeError(ErrorCode.BatchFileDeltasPropertyNotArray, 'Invalid batch file, deltas property is not an array.');
    }

    // Validate every encoded delta string.
    for (const encodedDelta of deltas) {
      if (typeof encodedDelta !== 'string') {
        throw new SidetreeError(ErrorCode.BatchFileDeltasNotArrayOfStrings, 'Invalid batch file, deltas property is not an array of strings.');
      }

      const deltaBuffer = Buffer.from(encodedDelta);

      // Verify size of each delta does not exceed the maximum allowed limit.
      if (deltaBuffer.length > ProtocolParameters.maxDeltaSizeInBytes) {
        throw new SidetreeError(
          ErrorCode.BatchFileDeltaSizeExceedsLimit,
          `Operation size of ${deltaBuffer.length} bytes exceeds the allowed limit of ${ProtocolParameters.maxDeltaSizeInBytes} bytes.`
        );
      }
    }
  }

  /**
   * Creates batch file buffer.
   */
  public static async createBuffer (createOperations: CreateOperation[], recoverOperations: RecoverOperation[], updateOperations: UpdateOperation[]) {
    const deltas = [];
    deltas.push(...createOperations.map(operation => operation.encodedDelta!));
    deltas.push(...recoverOperations.map(operation => operation.encodedDelta!));
    deltas.push(...updateOperations.map(operation => operation.encodedDelta!));

    const batchFileModel = {
      deltas
    };

    const rawData = Buffer.from(JSON.stringify(batchFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}
