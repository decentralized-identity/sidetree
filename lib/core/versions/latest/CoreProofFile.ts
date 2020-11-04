import Compressor from './util/Compressor';
import DeactivateOperation from './DeactivateOperation';
import RecoverOperation from './RecoverOperation';

/**
 * Defines operations related to a Core Proof File.
 */
export default class CoreProofFile {

  /**
   * Creates the buffer of a Core Proof File.
   * 
   * @returns `Buffer` if at least one operation is given, `undefined` otherwise.
   */
  public static async createBuffer (recoverOperations: RecoverOperation[], deactivateOperations: DeactivateOperation[]): Promise<Buffer | undefined> {
    if (recoverOperations.length === 0 && deactivateOperations.length === 0) {
      return undefined;
    }

    const recoverProofs = recoverOperations.map(operation => { return { signedData: operation.signedDataJws.toCompactJws() }});
    const deactivateProofs = deactivateOperations.map(operation => { return { signedData: operation.signedDataJws.toCompactJws() }});

    const coreProofFileModel = {
      operations: {
        recover: recoverProofs,
        deactivate: deactivateProofs
      }
    };

    const rawData = Buffer.from(JSON.stringify(coreProofFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}
