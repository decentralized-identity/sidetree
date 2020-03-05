import DidResolutionModel from './models/DidResolutionModel';
import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from './interfaces/IVersionManager';
import NamedAnchoredOperationModel from './models/NamedAnchoredOperationModel';
import OperationType from './enums/OperationType';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 *
 * NOTE: Resolver needs to be versioned because it depends on `VersionManager` being constructed to fetch the versioned operation processor.
 */
export default class Resolver {

  public constructor (private versionManager: IVersionManager, private operationStore: IOperationStore) { }

  /**
   * Resolve the given DID unique suffix to its DID Doducment.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns DID Document. Undefined if the unique suffix of the DID is revoked or not found.
   *
   * Iterate over all operations in blockchain-time order extending the
   * the operation chain while checking validity.
   */
  public async resolve (didUniqueSuffix: string): Promise<object | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    // NOTE: We are passing the DID resolution model into apply method so that both:
    // 1. `didDocument` can be `undefined` initially; and
    // 2. `didDocument` can be modified directly in-place in subsequent applying of operations.
    const didResolutionModel: DidResolutionModel = {};

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createAndRecoverAndRevokeOperations = operations.filter(
      op => op.type === OperationType.Create ||
      op.type === OperationType.Recover ||
      op.type === OperationType.Revoke);

    // Apply "full" operations first.
    await this.applyOperations(createAndRecoverAndRevokeOperations, didResolutionModel);

    // If no valid full operation is found at all, the DID is not anchored.
    if (didResolutionModel.didDocument === undefined) {
      return undefined;
    }

    // Get only update operations that came after the last full operation.
    const lastOperationTransactionNumber = didResolutionModel.metadata!.lastOperationTransactionNumber;
    const updateOperations = operations.filter(op => op.type === OperationType.Update);
    const updateOperationsToBeApplied = updateOperations.filter(op => op.transactionNumber > lastOperationTransactionNumber);

    // Apply "update/delta" operations.
    await this.applyOperations(updateOperationsToBeApplied, didResolutionModel);

    return didResolutionModel.didDocument;
  }

  /**
   * Applies the given operations to the given DID document.
   * @param operations The list of operations to be applied in sequence.
   * @param didResolutionModel
   *        The container object that contains the initial metadata needed for applying the operations and the reference to the DID document to be modified.
   */
  private async applyOperations (
    operations: NamedAnchoredOperationModel[],
    didResolutionModel: DidResolutionModel
    ) {
    for (const operation of operations) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      await operationProcessor.apply(operation, didResolutionModel);
    }
  }
}
