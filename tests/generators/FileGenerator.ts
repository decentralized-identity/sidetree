import CoreIndexFile from '../../lib/core/versions/latest/CoreIndexFile';
import CoreProofFile from '../../lib/core/versions/latest/CoreProofFile';
import DeactivateOperation from '../../lib/core/versions/latest/DeactivateOperation';
import OperationGenerator from './OperationGenerator';
import ProvisionalIndexFile from '../../lib/core/versions/latest/ProvisionalIndexFile';
import ProvisionalProofFile from '../../lib/core/versions/latest/ProvisionalProofFile';
import RecoverOperation from '../../lib/core/versions/latest/RecoverOperation';
import UpdateOperation from '../../lib/core/versions/latest/UpdateOperation';

/**
 * A class containing methods for generating various Sidetree files.
 * Mainly useful for testing purposes.
 */
export default class FileGenerator {

  /**
   * Generates a `CoreIndexFile`, mainly used for testing purposes.
   */
  public static async generateCoreIndexFile (): Promise<CoreIndexFile> {
    const createOperationData = await OperationGenerator.generateCreateOperation();
    const provisionalIndexFileHash = OperationGenerator.generateRandomHash();
    const coreProofFileHash = undefined;
    const coreIndexFileBuffer =
    await CoreIndexFile.createBuffer('writerLockId', provisionalIndexFileHash, coreProofFileHash, [createOperationData.createOperation], [], []);
    const coreIndexFile = await CoreIndexFile.parse(coreIndexFileBuffer);

    return coreIndexFile;
  }

  /**
   * Generates a `ProvisionalIndexFile`, mainly used for testing purposes.
   */
  public static async generateProvisionalIndexFile (): Promise<ProvisionalIndexFile> {
    const updateRequestData = await OperationGenerator.generateUpdateOperationRequest();
    const chunkFileHash = OperationGenerator.generateRandomHash();
    const provisionalProofFileHash = OperationGenerator.generateRandomHash();
    const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileHash, provisionalProofFileHash, [updateRequestData.updateOperation]);
    const provisionalIndexFile = await ProvisionalIndexFile.parse(provisionalIndexFileBuffer);

    return provisionalIndexFile;
  }

  /**
   * Creates a `CoreProofFile`, mainly used for testing purposes.
   */
  public static async createCoreProofFile (
    recoverOperations: RecoverOperation[], deactivateOperations: DeactivateOperation[]
  ): Promise<CoreProofFile | undefined> {
    const deactivatedDidUniqueSuffixes = deactivateOperations.map(operation => operation.didUniqueSuffix);
    const coreProofFileBuffer = await CoreProofFile.createBuffer(recoverOperations, deactivateOperations);

    if (coreProofFileBuffer === undefined) {
      return undefined;
    }

    const coreProofFile = await CoreProofFile.parse(coreProofFileBuffer, deactivatedDidUniqueSuffixes);
    return coreProofFile;
  }

  /**
   * Creates a `ProvisionalProofFile`, mainly used for testing purposes.
   */
  public static async createProvisionalProofFile (updateOperations: UpdateOperation[]): Promise<ProvisionalProofFile | undefined> {
    const provisionalProofFileBuffer = await ProvisionalProofFile.createBuffer(updateOperations);

    if (provisionalProofFileBuffer === undefined) {
      return undefined;
    }

    const provisionalProofFile = await ProvisionalProofFile.parse(provisionalProofFileBuffer);
    return provisionalProofFile;
  }
}
