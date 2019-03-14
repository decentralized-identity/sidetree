import * as Protocol from './Protocol';
import Document, { IDocument } from './lib/Document';
import { Cas } from './Cas';
import { Config, ConfigKey } from './Config';
import { Operation, OperationType } from './Operation';
import { createOperationStore, OperationStore } from './OperationStore';

/**
 * Represents the interface used by other components to process DID operations
 * (create, update, delete, recover) and to retrieve the current version of a
 * DID document.
 */
export interface OperationProcessor {

  /**
   * Initialize the operation processor. This method
   * is called once before any of the operations below.
   */
  initialize (resuming: boolean): Promise<void>;

  /**
   * Process a DID write (state changing) operation with the guarantee
   * that any future resolve for the same DID sees the effect of the
   * operation.
   */
  process (operation: Operation): Promise<void>;

  /**
   * Remove all previously processed operations with transactionNumber
   * greater or equal to the provided parameter value.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   */
  rollback (transactionNumber?: number): Promise<void>;

  /**
   * Resolve a did.
   * @param did The DID to resolve. e.g. did:sidetree:abc123.
   * @returns DID Document of the given DID. Undefined if the DID is deleted or not found.
   */
  resolve (did: string): Promise<IDocument | undefined>;
}

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
class OperationProcessorImpl implements OperationProcessor {

  public constructor (private didMethodName: string, private operationStore: OperationStore) {

  }

  /**
   * Initialize the operation processor
   * @param resuming is the initialization from "scratch" or resuming
   *                 from a previous stored state?
   */
  public async initialize (resuming: boolean) {
    await this.operationStore.initialize(resuming);
  }

  /**
   * Processes a specified DID state changing operation. Simply store
   * the operation in the store.
   */
  public async process (operation: Operation): Promise<void> {
    return this.operationStore.put(operation);
  }

  /**
   * Remove all previously processed operations with transactionNumber
   * greater or equal to the provided transaction number. Relies on
   * OperationStore.delete that implements this functionality.
   */
  public async rollback (transactionNumber?: number): Promise<void> {
    return this.operationStore.delete(transactionNumber);
  }

  /**
   * Resolve the given DID to its DID Doducment.
   * @param did The DID to resolve. e.g. did:sidetree:abc123.
   * @returns DID Document of the given DID. Undefined if the DID is deleted or not found.
   *
   * Iterate over all operations in blockchain-time order extending the
   * the operation chain while checking validity.
   */
  public async resolve (did: string): Promise<IDocument | undefined> {
    let didDocument: IDocument | undefined;
    let previousOperation: Operation | undefined;

    const didUniqueSuffix = did.substring(this.didMethodName.length);
    const didOps = await this.operationStore.get(didUniqueSuffix);

    // Apply each operation in chronological order to build a complete DID Document.
    for (const operation of didOps) {
      const newDidDocument = await this.apply(operation, previousOperation, didDocument);

      if (newDidDocument) {
        didDocument = newDidDocument;
        previousOperation = operation;

        // If this is a delete operation, this will be the last valid operation for this DID.
        if (operation.type === OperationType.Delete) {
          break;
        }
      }
    }

    return didDocument;
  }

  /**
   * Applies an operation against a DID document.
   * @param operation The operation to apply against the given current DID Document (if any).
   * @param previousOperation The previously operation applied if any. Used for operation validation.
   * @param currentDidDocument The DID document to apply the given operation against.
   * @returns undefined if any validation fails; the updated document otherwise.
   */
  private async apply (operation: Operation, previousOperation: Operation | undefined, currentDidDocument: IDocument | undefined):
    Promise<IDocument | undefined> {

    if (operation.type === OperationType.Create) {

      // If either of these is defined, then we have seen a previous create operation.
      if (previousOperation || currentDidDocument) {
        return undefined;
      }

      const originalDidDocument = this.getOriginalDocument(operation);
      if (originalDidDocument === undefined) {
        return undefined;
      }

      const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

      if (!signingKey) {
        return undefined;
      }

      if (!(await operation.verifySignature(signingKey))) {
        return undefined;
      }

      return originalDidDocument;
    } else {
      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !currentDidDocument) {
        return undefined;
      }

      // Any non-create needs a previous operation hash  ...
      if (!operation.previousOperationHash) {
        return undefined;
      }

      // ... that should match the hash of the latest valid operation (previousOperation)
      if (operation.previousOperationHash !== previousOperation.getOperationHash()) {
        return undefined;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(currentDidDocument, operation.signingKeyId);
      if (!publicKey) {
        return undefined;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return undefined;
      }

      const patchedDocument = Operation.applyJsonPatchToDidDocument(currentDidDocument, operation.patch!);
      return patchedDocument;
    }
  }

  /**
   * Gets the original DID document from a create operation.
   */
  private getOriginalDocument (createOperation: Operation): IDocument | undefined {
    const protocolVersion = Protocol.getProtocol(createOperation.transactionTime!);
    return Document.from(createOperation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
  }
}

/**
 * Factory function for creating a operation processor
 */
export function createOperationProcessor (_cas: Cas, config: Config): OperationProcessor {
  const operationStore = createOperationStore(config);
  return new OperationProcessorImpl(config[ConfigKey.DidMethodName], operationStore);
}
