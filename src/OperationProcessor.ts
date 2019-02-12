import * as Protocol from './Protocol';
import Cryptography from './lib/Cryptography';
import DidPublicKey from './lib/DidPublicKey';
import Document from './lib/Document';
import { Cas } from './Cas';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { getOperationHash, Operation, OperationType } from './Operation';
import { LinkedList } from 'linked-list-typescript';
import { OperationStore } from './OperationStore';

/**
 * Each operation that is submitted to OperationProcessor for processing
 * has one of the following status at any given point.
 *
 * Terminology useful for various comments below:
 *
 * Parent/Prev: For a non-create operation o this refers to the previous operation (version)
 * specified by o.
 * Ancestor: Transitive closure of the Parent relation.
 * Descendant: Inverse of Ancestor
 * Known Ancestry/Complete Ancestry: A predicate/property of an operation that indicates whether all the
 * ancestors of the operation are known (by the OperationProcessor).
 * Siblings: Two or more operations that point to the same parent.
 */
enum OperationStatus {
  /**
   * An operation is in Unvalidated state if its ancestry is incomplete.
   */
  Unvalidated,

  /**
   * An operation is in Valid state if all the following conditions hold:
   * (1) It's ancestry is complete
   * (2) Validation checks such as signature verification pass
   * (3) It is the earliest sibling in terms of its timestamp (see earliest interface below).
   */
  Valid,

  /**
   * An operation is in Invalid state if its ancestry is complete but at least one of the three conditions
   * above is false.
   */
  Invalid
}

/**
 * VersionId identifies the version of a DID document. We use the hash of the
 * operation that produces a particular version of a DID document as its versionId.
 * This usage is guaranteed to produce unique VersionId's since the operation contains
 * as one of its properties the previous VersionId. Since the operation hash is
 * just a string we alias VersionId to string.
 *
 * With this usage, the operation hash serves two roles (1) an identifier for an operation
 * (2) an identifier for the DID document produced by the operation. In the code below,
 * we always use VersionId in places where we mean (2) and an OperationHash defined below
 * when we mean (1).
 *
 * Since we identify versions using the operation it is meaningful to apply OperationStatus
 * to versions.
 */
export type VersionId = string;

/**
 * Alias OperationHash to string - see comment above
 */
export type OperationHash = string;

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
  process (operation: Operation): Promise<string>;

  /**
   * Remove all previously processed operations with transactionNumber
   * greater than the provided parameter value.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   */
  rollback (transactionNumber?: number): Promise<void>;

  /**
   * Resolve a did.
   */
  resolve (did: string): Promise<DidDocument | undefined>;

  /**
   * Returns the Did document for a given version identifier.
   */
  lookup (versionId: VersionId): Promise<DidDocument | undefined>;

  /**
   * Return the first (initial) version identifier given
   * version identifier, which is also the DID for the
   * document corresponding to the versions. Return undefined
   * if the version id or some previous version in the chain
   * is unknown.
   */
  first (versionId: VersionId): Promise<VersionId | undefined>;

  /**
   * Return the last (latest/most recent) version identifier of
   * a given version identifier. Return undefined if the version
   * identifier is unknown or some successor identifier is unknown.
   */
  last (versionId: VersionId): Promise<VersionId | undefined>;

  /**
   * Return the previous version identifier of a given DID version
   * identifier. Return undefined if no such identifier is known.
   */
  previous (versionId: VersionId): Promise<VersionId | undefined>;

  /**
   * Return the next version identifier of a given DID version
   * identifier. Return undefined if no such identifier is known.
   */
  next (versionId: VersionId): Promise<VersionId | undefined>;
}

/**
 * The timestamp of an operation. We define a linear ordering of
 * timestamps using the function earlier() below.
 * TODO: Consider consolidating this modal interface with ResolvedTransaction.
 */
interface OperationTimestamp {
  readonly transactionNumber: number;
  readonly operationIndex: number;
}

function earlier (ts1: OperationTimestamp, ts2: OperationTimestamp): boolean {
  return ((ts1.transactionNumber < ts2.transactionNumber) ||
          (ts1.transactionNumber === ts2.transactionNumber) && (ts1.operationIndex < ts2.operationIndex));
}

/**
 * Information about an operation relevant for maintaining OperationProcessor state.
 */
interface OperationInfo {
  readonly type: OperationType;
  readonly timestamp: OperationTimestamp;
  readonly parent?: VersionId;

  status: OperationStatus;

  // Most recent missing ancestor if one of the ancestors is missing. Defined only if status
  // is Unvalidated.
  missingAncestor?: VersionId;
}

/**
 * The current implementation of OperationProcessor is a main-memory implementation without any persistence. This
 * means that when a node is powered down and restarted DID operations need to be applied
 * from the beginning of time. This implementation will be extended in the future to support
 * persistence.
 */
class OperationProcessorImpl implements OperationProcessor {

  /**
   * Map a operation hash to the OperationInfo which contains sufficient
   * information to reconstruct the operation.
   */
  private opHashToInfo: Map<OperationHash, OperationInfo> = new Map();

  /**
   * The set of deleted DIDs.
   */
  private deletedDids: Set<string> = new Set();

  /**
   * Map a valid versionId to the next valid versionId whenever one exists. The next
   * version of a valid node is a valid child node. There is at most one valid child node
   * (it could have zero) due to our validity checks (condition 3 in comment above Valid).
   */
  private nextVersion: Map<VersionId, VersionId> = new Map();

  /**
   * Map a "missing" operation (hash) to the list of descendant operations. The
   * missing operation is the nearest ancestor of each of the descendants. The
   * descendants are listed in topological sort order. For example, given these operations
   *
   *               m <- o1 <- o2 <- o3
   *                      \
   *                       \<- o4 <- o5.
   *
   * the linked list for missing operation m might be o1 - o4 - o5 - o2 - o3, but not
   * o1 - o3 - o2 - o4 - o5.
   *
   */
  private waitingDescendants: Map<OperationHash, LinkedList<OperationHash>> = new Map();

  private operationStore: OperationStore;

  /**
   * The list of deferred (unapplied) operations, stored as a mapping from each did to the list
   * of deferred operations for the did.
   */
  private deferredOperations: Map<OperationHash, LinkedList<OperationHash>> = new Map();

  public constructor (private readonly cas: Cas, private didMethodName: string) {
    this.operationStore = new OperationStore(this.cas);
  }

  /**
   * Processes a specified DID state changing operation. The current implementation simply stores the operation
   * in a deferred operations list and returns the hash of the operation. The deferred operations for a
   * particular did are processed during the next resolve of the did.
   */
  public async process (operation: Operation): Promise<string> {
    const opHash = getOperationHash(operation);

    // Throw errors if missing any required metadata:
    // any operation anchored in a blockchain must have this metadata.
    if (operation.transactionTime === undefined) {
      throw Error('Invalid operation: transactionTime undefined');
    }

    if (operation.transactionNumber === undefined) {
      throw Error('Invalid operation: transactionNumber undefined');
    }

    if (operation.operationIndex === undefined) {
      throw Error('Invalid operation: operationIndex undefined');
    }

    if (operation.batchFileHash === undefined) {
      throw Error('Invalid operation: batchFileHash undefined');
    }

    this.operationStore.store(opHash, operation);

    const did = this.getDidUniqueSuffix(operation, opHash);
    this.getDeferredOperationsList(did).append(opHash);

    return opHash;
  }

  /**
   * Remove all previously processed operations
   * with transactionNumber greater than the provided transaction number.
   * If no transaction number is given, all operations are rolled back (unlikely scenario).
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   *
   * The current implementation is inefficient: It simply scans the two
   * hashmaps storing the core Did state and removes all entries with
   * a greater transaction number.  In future, the implementation should be optimized
   * for the common case by keeping a sliding window of recent operations.
   */
  public async rollback (transactionNumber?: number): Promise<void> {

    // If no transaction number is given to rollback to, rollback everything.
    if (!transactionNumber) {
      console.warn('Rolling back all operations...');
      this.opHashToInfo.clear();
      this.deletedDids.clear();
      this.nextVersion.clear();
      this.waitingDescendants.clear();
      this.operationStore = new OperationStore(this.cas);
      console.warn('Rolled back all operations.');
      return;
    }

    // Iterate over all operations and remove those with with
    // transactionNumber greater or equal to the provided parameter.
    // applied operations are in opHashToInfo structure...
    this.opHashToInfo.forEach((opInfo, opHash, map) => {
      if (opInfo.timestamp.transactionNumber >= transactionNumber) {

        // In addition to removing the obsolete operation from the opHashToInfo map (after this if-block),
        // If the obsolete operation was considered valid, then the parent's next link is invalid, need to remove the next link also.
        // Else if the operation has a missing ancestor, then need to remove the operation from the list of waiting descendants of the missing ancestor.
        if (opInfo.status === OperationStatus.Valid) {
          this.invalidatePreviouslyValidOperation(opHash);
        } else if (opInfo.status === OperationStatus.Unvalidated) {
          const missingAncestor = opInfo.missingAncestor!;
          const waitingDescendantsOfAncestor = this.waitingDescendants.get(missingAncestor)!;
          waitingDescendantsOfAncestor.remove(opHash);
        }

        map.delete(opHash);
      }
    });

    // ... deferred operations are in the deferred operations list
    for (const [, opList] of this.deferredOperations.entries()) {
      // The documentation for LinkedList does not say anything about iteration with list updates.
      // To be safe, we store the deleted operations in a separate list and delete them after the
      // iteration of opList.
      const deletedOpList = new LinkedList<OperationHash>();
      for (const opHash of opList) {
        const operator = await this.operationStore.lookup(opHash);
        if (operator.transactionNumber! >= transactionNumber) {
          deletedOpList.append(opHash);
        }
      }

      for (const deletedOpHash of deletedOpList) {
        opList.remove(deletedOpHash);
      }
    }
  }

  /**
   * Resolve the given DID to its DID Doducment.
   * @param did The DID to resolve. e.g. did:sidetree:abc123.
   * @returns DID Document of the given DID. Undefined if the DID is deleted or not found.
   */
  public async resolve (did: string): Promise<DidDocument | undefined> {
    const didUniqueSuffix = did.substring(this.didMethodName.length);

    await this.processDeferredOperationsOfDid(didUniqueSuffix);

    if (this.deletedDids.has(did)) {
      return undefined;
    }

    const latestVersion = await this.last(didUniqueSuffix);

    // lastVersion === undefined implies we do not know about the did
    if (latestVersion === undefined) {
      return undefined;
    }

    return this.lookup(latestVersion);
  }

  /**
   * Returns the DID Document for a given version identifier.
   */
  public async lookup (versionId: VersionId): Promise<DidDocument | undefined> {
    // Version id is also the operation hash that produces the document
    const opHash = versionId;

    const opInfo = this.opHashToInfo.get(opHash);

    // We don't know anything about this operation
    if (opInfo === undefined) {
      return undefined;
    }

    // Construct the operation using a CAS lookup
    const op = await this.operationStore.lookup(opHash);

    if (this.isInitialVersion(opInfo)) {
      const protocolVersion = Protocol.getProtocol(op.transactionTime!);
      return Document.from(op.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
    } else {
      const prevVersion = op.previousOperationHash!;
      const prevDidDoc = await this.lookup(prevVersion);
      if (prevDidDoc === undefined) {
        return undefined;
      } else {
        return Operation.applyJsonPatchToDidDocument(prevDidDoc, op.patch!);
      }
    }
  }

  /**
   * Return the previous version id of a given DID version. The implementation
   * is inefficient and involves an async cas read. This should not be a problem
   * since this method is not hit for any of the externally exposed DID operations.
   */
  public async previous (versionId: VersionId): Promise<VersionId | undefined> {
    const opInfo = this.opHashToInfo.get(versionId);
    if (opInfo !== undefined) {
      return opInfo.parent;
    }
    return undefined;
  }

  /**
   * Return the first version of a DID document given a possibly later version.
   * A simple recursive implementation using prev; not very efficient but should
   * not matter since this method is not hit for any externally exposed DID
   * operations.
   */
  public async first (versionId: VersionId): Promise<VersionId | undefined> {
    const opInfo = this.opHashToInfo.get(versionId);
    if (opInfo === undefined) {
      return undefined;
    }

    while (true) {
      const prevVersionId = await this.previous(versionId);
      if (prevVersionId === undefined) {
        return versionId;
      }

      versionId = prevVersionId;
    }
  }

  /**
   * Return the next version of a DID document if it exists or undefined otherwise.
   */
  public async next (versionId: VersionId): Promise<VersionId | undefined> {
    const nextVersionId = this.nextVersion.get(versionId);
    if (nextVersionId === undefined) {
      return undefined;
    } else {
      return nextVersionId;
    }
  }

  /**
   * Returns the latest (most recent) version of a DID Document.
   * Returns undefined if the version is unknown.
   */
  public async last (versionId: VersionId): Promise<VersionId | undefined> {

    const opInfo = this.opHashToInfo.get(versionId);
    if (opInfo === undefined) {
      return undefined;
    }

    while (true) {
      const nextVersionId = await this.next(versionId);
      if (nextVersionId === undefined) {
        return versionId;
      } else {
        versionId = nextVersionId;
      }
    }
  }

  /**
   * Return true if the provided operation is an initial version i.e.,
   * produced by a create operation.
   */
  private isInitialVersion (opInfo: OperationInfo): boolean {
    return opInfo.type === OperationType.Create;
  }

  /**
   * Processes a specified DID state changing operation.
   */
  private async processOperation (opHash: OperationHash): Promise<void> {
    const operation = await this.operationStore.lookup(opHash);

    // opInfo is operation with derivable properties projected out
    const opTimestamp: OperationTimestamp = {
      transactionNumber: operation.transactionNumber!,
      operationIndex: operation.operationIndex!
    };

    const opInfo: OperationInfo = {
      type: operation.type,
      timestamp: opTimestamp,
      parent: operation.previousOperationHash,
      status: OperationStatus.Unvalidated
    };

    // If there is already a known operation with the same hash
    // and that operation is timestamped earlier than this incoming one being processed,
    // we can ignore incoming operation because the earlier operation of the same hash takes precedence.
    const existingOperationInfo = this.opHashToInfo.get(opHash);
    if (existingOperationInfo !== undefined && earlier(existingOperationInfo.timestamp, opInfo.timestamp)) {
      return undefined;
    }

    // Update our mapping of operation hash to operation info overwriting
    // previous info if it exists
    this.opHashToInfo.set(opHash, opInfo);

    if (operation.type === OperationType.Delete ||
        operation.type === OperationType.Recover) {
      // NOTE: only assuming and hanldling delete currently.
      // TODO: validate recovery key.

      this.deletedDids.add(operation.did!);
    }

    // Else the operation is a create or an update.
    await this.processInternal(opHash, opInfo);
  }

  private async processInternal (opHash: OperationHash, opInfo: OperationInfo): Promise<void> {
    // Create operation (which has no parents) is handled differently from the other
    // operations which do have parents.
    if (opInfo.type === OperationType.Create) {
      await this.processCreateOperation(opHash, opInfo);
    } else {
      await this.processOperationWithParent(opHash, opInfo);
    }

    // Process operations waiting on this operation
    await this.processDescendantsWaitingOn(opHash);
  }

  private async processCreateOperation (operationHash: OperationHash, operationInfo: OperationInfo): Promise<void> {
    // Get the DID Document formed up until the parent operation.
    const didDocument = await this.lookup(operationHash);

    // Fetch the public key to be used for signature verification.
    const operation = await this.operationStore.lookup(operationHash);
    const publicKey = OperationProcessorImpl.getPublicKey(didDocument!, operation.signingKeyId);

    // Signature verification.
    let verified = false;
    if (publicKey) {
      verified = await Cryptography.verifySignature(operation.encodedPayload, operation.signature, publicKey);
    }

    if (verified) {
      operationInfo.status = OperationStatus.Valid;
    } else {
      operationInfo.status = OperationStatus.Invalid;
    }
  }

  private async processOperationWithParent (opHash: OperationHash, opInfo: OperationInfo): Promise<void> {
    const parentOpHash = opInfo.parent!;
    const parentOpInfo = this.opHashToInfo.get(parentOpHash);

    // If we do not know about the parent, then the ancestry of this operation is incomplete.
    // The operation status is Unvalidated so we add this operation to the list of waiting descendants
    // of the parent operation (hash).
    if (parentOpInfo === undefined) {
      opInfo.status = OperationStatus.Unvalidated;
      opInfo.missingAncestor = parentOpHash;
      this.addWaitingDescendants(opInfo.missingAncestor, opHash);
      return;
    }

    // The parent has an Unvalidated status. This implies an incomplete ancestry of the
    // parent and therefore of this operation. We leave the status to be Unvalidated and
    // update the waitingDescendants of the closest missing ancestor.
    if (parentOpInfo.status === OperationStatus.Unvalidated) {
      opInfo.missingAncestor = parentOpInfo.missingAncestor!;
      this.addWaitingDescendants(opInfo.missingAncestor, opHash);
      return;
    }

    // If the parent is invalid, then this operation is invalid as well.
    if (parentOpInfo.status === OperationStatus.Invalid) {
      opInfo.status = OperationStatus.Invalid;
      return;
    }

    // Assert: parentOpInfo.status === OperationStatus.Valid. Validate the operation
    if (!await this.validate(opHash, opInfo)) {
      opInfo.status = OperationStatus.Invalid;
      return;
    }

    // The operation is intrinsically valid. Before we set it to valid, we need
    // to ensure that it is the earliest sibling among child nodes of its parent.
    const earliestSiblingHash = this.nextVersion.get(parentOpHash);

    if (earliestSiblingHash !== undefined) {
      const earliestSiblingInfo = this.opHashToInfo.get(earliestSiblingHash)!;

      // If the existing earliest sibling operation is earlier than the operation to be added,
      //   then the operation to be added is invalid.
      // Else current operation is the earliest sibling operation and thus is valid,
      //   the existing sibling's entire descendant chain in the next version map need to be removed.
      if (earlier(earliestSiblingInfo.timestamp, opInfo.timestamp)) {
        opInfo.status = OperationStatus.Invalid;
        return;
      } else {
        let opToInvalidate: string | undefined = earliestSiblingHash;
        do {
          this.invalidatePreviouslyValidOperation(opToInvalidate);
          opToInvalidate = this.nextVersion.get(opToInvalidate);
        } while (opToInvalidate !== undefined);
        // fall through ...
      }
    }

    opInfo.status = OperationStatus.Valid;
    this.nextVersion.set(parentOpHash, opHash);
    return;
  }

  private addWaitingDescendants (missingAncestor: OperationHash, opHash: OperationHash) {
    const waitingDescendants = this.waitingDescendants.get(missingAncestor);
    if (waitingDescendants === undefined) {
      this.waitingDescendants.set(missingAncestor, new LinkedList<OperationHash>(opHash));
    } else {
      waitingDescendants.append(opHash);
    }
  }

  private async validate (opHash: OperationHash, opInfo: OperationInfo): Promise<boolean> {
    const parentOpHash = opInfo.parent!;
    const parentOpInfo = this.opHashToInfo.get(parentOpHash)!;
    // Assert: parentOpInfo.status === OperationStatus.Valid.

    if (!earlier(parentOpInfo.timestamp, opInfo.timestamp)) {
      return false;
    }

    // TODO Perform:
    // - operation number validation

    // Get the DID Document formed up until the parent operation.
    const didDocument = await this.lookup(parentOpHash);

    // Fetch the public key to be used for signature verification.
    const operation = await this.operationStore.lookup(opHash);
    const publicKey = OperationProcessorImpl.getPublicKey(didDocument!, operation.signingKeyId);

    // Signature verification.
    let verified = false;
    if (publicKey) {
      verified = await Cryptography.verifySignature(operation.encodedPayload, operation.signature, publicKey);
    }
    return verified;

    return true;
  }

  /**
   * Invalidates the given operation by:
   * 1. Removing its parent's reference to it in the next version map.
   * 2. Sets the operation status to be 'Invalid'.
   * @param opHash The hash of the operation to be invalidated.
   */
  private invalidatePreviouslyValidOperation (opHash: OperationHash) {
    const opInfo = this.opHashToInfo.get(opHash)!;

    if (opInfo.parent) {
      this.nextVersion.delete(opInfo.parent);
    }

    opInfo.status = OperationStatus.Invalid;
  }

  private async processDescendantsWaitingOn (opHash: OperationHash) {
    const waitingDescendants = this.waitingDescendants.get(opHash);
    if (waitingDescendants === undefined) {
      return;
    }

    for (const descendantHash of waitingDescendants) {
      const descendantInfo = this.opHashToInfo.get(descendantHash)!;
      // assert: descendantInfo.status === Unvalidated and descendantInfo.missingAncestor === opHash
      await this.processInternal(descendantHash, descendantInfo);
    }
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

  /**
   * Get the deferred operations list for a did. If the list is not present,
   * an empty list is created and associated with the did, and returned as output.
   */
  private getDeferredOperationsList (did: string): LinkedList<OperationHash> {
    let deferredOperationsList = this.deferredOperations.get(did);
    if (deferredOperationsList === undefined) {
      deferredOperationsList = new LinkedList();
      this.deferredOperations.set(did, deferredOperationsList);
    }

    return deferredOperationsList;
  }

  /**
   * Gets the DID unique suffix of an operation. For create operation, this is the operation hash;
   * for others the DID included with the operation can be used to obtain the unique suffix.
   */
  private getDidUniqueSuffix (operation: Operation, operationHash: OperationHash): string {
    if (operation.type === OperationType.Create) {
      return operationHash;
    } else {
      const didUniqueSuffix = operation.did!.substring(this.didMethodName.length);
      return didUniqueSuffix;
    }
  }

  /**
   * Iterate over the deferred (unapplied) operations of a did and process the same.
   */
  private async processDeferredOperationsOfDid (did: string): Promise<void> {
    const deferredOperationsList = this.deferredOperations.get(did);
    if (deferredOperationsList !== undefined) {
      for (const deferredOpHash of deferredOperationsList) {
        await this.processOperation(deferredOpHash);
      }
      this.deferredOperations.delete(did);
    }
  }
}

/**
 * Factory function for creating a operation processor
 */
export function createOperationProcessor (cas: Cas, didMethodName: string): OperationProcessor {
  return new OperationProcessorImpl(cas, didMethodName);
}
