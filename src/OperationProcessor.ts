import * as Protocol from './Protocol';
import { Cas } from './Cas';
import { Config, ConfigKey } from './Config';
import DidPublicKey from './lib/DidPublicKey';
import Document from './lib/Document';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { Operation, OperationType, getOperationHash } from './Operation';
import { createOperationStore, OperationStore } from './OperationStore';

/**
 * Represents the interface used by other components to process DID operations
 * (create, update, delete, recover) and to retrieve the current version of a
 * DID document.
 */
export interface OperationProcessor {

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
  resolve (did: string): Promise<DidDocument | undefined>;
}

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
class OperationProcessorImpl implements OperationProcessor {

  private operationStore: OperationStore;

  public constructor (private didMethodName: string) {
    this.operationStore = createOperationStore(didMethodName);
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
  public async resolve (did: string): Promise<DidDocument | undefined> {
    let didDocument: DidDocument | undefined;
    let previousOperation: Operation | undefined;

    const didUniqueSuffix = did.substring(this.didMethodName.length);

    const didOps = await this.operationStore.get(didUniqueSuffix);
    for (const operation of didOps) {
      if (await this.isValid(operation, previousOperation, didDocument)) {
        didDocument = this.getUpdatedDocument(didDocument, operation);
        previousOperation = operation;

        if (operation.type === OperationType.Delete) {
          break;
        }
      }
    }

    return didDocument;
  }

  /**
   * Is an operation valid in the context of a resolve() when extending
   * operation chain for a DID. When this function is called, resolve() has
   * constructed a valid operation that starts with some Create operation and
   * ends with previousOperation, resulting the DID Document 'currentDidDocument'.
   * This function checks if parameter operation can be used to legitimately
   * extend this chain.
   */
  private async isValid (operation: Operation, previousOperation: Operation | undefined, currentDidDocument: DidDocument | undefined):
    Promise<boolean> {

    if (operation.type === OperationType.Create) {

      // If either of these is defined, then we have seen a previous create operation.
      if (previousOperation || currentDidDocument) {
        return false;
      }

      const initialDidDocument = this.getInitialDocument(operation);
      const signingKey = OperationProcessorImpl.getPublicKey(initialDidDocument, operation.signingKeyId);

      if (!signingKey) {
        return false;
      }

      if (!(await operation.verifySignature(signingKey))) {
        return false;
      }

      return true;
    } else {
      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !currentDidDocument) {
        return false;
      }

      // Any non-create needs a previous operation hash  ...
      if (!operation.previousOperationHash) {
        return false;
      }

      // ... that should match the hash of the latest valid operation (previousOperation)
      if (operation.previousOperationHash !== getOperationHash(previousOperation)) {
        return false;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = OperationProcessorImpl.getPublicKey(currentDidDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return false;
      }

      return true;
    }
  }

  // Update a document with a specified operation.
  private getUpdatedDocument (didDocument: DidDocument | undefined, operation: Operation): DidDocument {
    if (operation.type === OperationType.Create) {
      return this.getInitialDocument(operation);
    } else {
      return Operation.applyJsonPatchToDidDocument(didDocument!, operation.patch!);
    }
  }

  // Get the initial DID document for a create operation
  private getInitialDocument (createOperation: Operation): DidDocument {
    const protocolVersion = Protocol.getProtocol(createOperation.transactionTime!);
    return Document.from(createOperation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
  }

  /**
   * Gets the specified public key from the given DID Document.
   * Returns undefined if not found.
   * @param keyId The ID of the public-key.
   */
  private static getPublicKey (didDocument: DidDocument, keyId: string): DidPublicKey | undefined {
    for (let i = 0; i < didDocument.publicKey.length; i++) {
      const publicKey = didDocument.publicKey[i];

      if (publicKey.id && publicKey.id.endsWith(keyId)) {
        return publicKey;
      }
    }

    return undefined;
  }
}

/**
 * Factory function for creating a operation processor
 */
export function createOperationProcessor (_cas: Cas, config: Config): OperationProcessor {
  return new OperationProcessorImpl(config[ConfigKey.DidMethodName]);
}
