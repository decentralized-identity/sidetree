import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from "./interfaces/IVersionManager";

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
   * @returns DID Document. Undefined if the unique suffix of the DID is deleted or not found.
   *
   * Iterate over all operations in blockchain-time order extending the
   * the operation chain while checking validity.
   */
  public async resolve (didUniqueSuffix: string): Promise<object | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    // NOTE: We create an object referencing the DID document to be constructed so that both:
    // 1. `didDocument` can be `undefined` initially; and
    // 2. `didDocument` can be modified directly in-place in subsequent document patching.
    let didDocumentReference: { didDocument: object | undefined } = { didDocument: undefined };
    let previousOperationHash: string | undefined;

    const operations = await this.operationStore.get(didUniqueSuffix);

    // Patch each operation in chronological order to build a complete DID Document.
    for (const operation of operations) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const patchResult = await operationProcessor.patch(operation, previousOperationHash, didDocumentReference);

      if (patchResult.validOperation) {
        previousOperationHash = patchResult.operationHash;
      } else {
        const index = operation.operationIndex;
        const time = operation.transactionTime;
        const number = operation.transactionNumber;
        console.info(`Ignored invalid operation for DID '${didUniqueSuffix}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    }

    return didDocumentReference.didDocument;
  }
}
