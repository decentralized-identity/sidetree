import * as Protocol from './Protocol';
import { Cas } from '../src/Cas';
import Cryptography from './lib/Cryptography';
import DidPublicKey from './lib/DidPublicKey';
import Document from './lib/Document';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation, OperationType } from './Operation';
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
   * @returns the hash of the operation.
   */
  process (operation: WriteOperation): Promise<void>;

  /**
   * Remove all previously processed operations with transactionNumber
   * greater or equal to the provided parameter value.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   */
  rollback (transactionNumber?: number): Promise<void>;

  /**
   * Resolve a did.
   */
  resolve (did: string): Promise<DidDocument | undefined>;
}

/**
 * The current implementation of OperationProcessor is a main-memory implementation without any persistence. This
 * means that when a node is powered down and restarted DID operations need to be applied
 * from the beginning of time. This implementation will be extended in the future to support
 * persistence.
 */
class OperationProcessorImpl implements OperationProcessor {

  private operationStore: OperationStore;

  public constructor (private didMethodName: string) {
    this.operationStore = createOperationStore(didMethodName);
  }

  /**
   * Processes a specified DID state changing operation. The current implementation inserts
   * the operation in the store and returns the hash of the operation.
   */
  public async process (operation: WriteOperation): Promise<void> {
    return this.operationStore.put(operation);
  }

  /**
   * Remove all previously processed operations
   * with transactionNumber greater or equal to the provided transaction number.
   * If no transaction number is given, all operations are rolled back (unlikely scenario).
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   */
  public async rollback (transactionNumber?: number): Promise<void> {
    return this.operationStore.delete(transactionNumber);
  }

  private async isValid (operation: WriteOperation, previousOperation: WriteOperation | undefined, currentDidDocument: DidDocument | undefined):
    Promise<boolean> {

    if (operation.type === OperationType.Create) {
      // TODO: Add signature verification for create operation
      return true;
    } else {
      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !currentDidDocument) {
        return false;
      }

      // If previous operation is a delete, then any subsequent operation is not valid
      if (previousOperation.type === OperationType.Delete) {
        return false;
      }

      const publicKey = OperationProcessorImpl.getPublicKey(currentDidDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      if (!(await Cryptography.verifySignature(operation.encodedPayload, operation.signature, publicKey))) {
        return false;
      }

      return true;
    }
  }

  private getUpdatedDocument (didDocument: DidDocument | undefined, operation: WriteOperation): DidDocument {
    if (operation.type === OperationType.Create) {
      const protocolVersion = Protocol.getProtocol(operation.transactionTime!);
      return Document.from(operation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
    } else {
      return WriteOperation.applyJsonPatchToDidDocument(didDocument!, operation.patch!);
    }
  }

  /**
   * Resolve the given DID to its DID Doducment.
   * @param did The DID to resolve. e.g. did:sidetree:abc123.
   * @returns DID Document of the given DID. Undefined if the DID is deleted or not found.
   */
  public async resolve (did: string): Promise<DidDocument | undefined> {
    let didDocument: DidDocument | undefined;
    let previousOperation: WriteOperation | undefined;

    const didUniqueSuffix = did.substring(this.didMethodName.length);

    const didOps = await this.operationStore.get(didUniqueSuffix);
    for (const operation of didOps) {
      if (await this.isValid(operation, previousOperation, didDocument)) {
        didDocument = this.getUpdatedDocument(didDocument, operation);
      }
    }

    return didDocument;
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
export function createOperationProcessor (_cas: Cas, didMethodName: string): OperationProcessor {
  return new OperationProcessorImpl(didMethodName);
}
