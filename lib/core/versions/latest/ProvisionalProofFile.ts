import Compressor from './util/Compressor';
import UpdateOperation from './UpdateOperation';

/**
 * Defines operations related to a Provisional Proof File.
 */
export default class ProvisionalProofFile {

  /**
   * Creates the buffer of a Provisional Proof File.
   * 
   * @returns `Buffer` if at least one operation is given, `undefined` otherwise.
   */
  public static async createBuffer (updateOperations: UpdateOperation[]): Promise<Buffer | undefined> {
    if (updateOperations.length === 0) {
      return undefined;
    }

    const updateProofs = updateOperations.map(operation => { return { signedData: operation.signedDataJws.toCompactJws() }});

    const provisionalProofFileModel = {
      operations: {
        update: updateProofs
      }
    };

    const rawData = Buffer.from(JSON.stringify(provisionalProofFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}
