import * as Base58 from 'bs58';
import BatchFile from './BatchFile';
import Multihash from './Multihash';
import { Cas } from './Cas';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { LinkedList } from 'linked-list-typescript';
import { WriteOperation, OperationType } from './Operation';

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
   * An operation is in Unvalidated state if its ancestry is complete.
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
   * Process a DID write (state changing) operation.
   * @returns An identifier that can be used to retrieve
   * the DID document version produced by the operation
   * and to traverse the version chain using the
   * first/last/prev/next methods below. If the write
   * operation is not legitimate return undefined.
   */
  process (operation: WriteOperation): string | undefined;

  /**
   * Remove all previously processed operations with transactionNumber
   * greater than the provided parameter value.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   */
  rollback (transactionNumber: number): void;

  /**
   * Resolve a did.
   */
  resolve (didUniquePortion: string): Promise<DidDocument | undefined>;

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
  readonly transactionTime: number;
  readonly transactionNumber: number;
  readonly operationIndex: number;
}

function earlier (ts1: OperationTimestamp, ts2: OperationTimestamp): boolean {
  return ((ts1.transactionNumber < ts2.transactionNumber) ||
          (ts1.transactionNumber === ts2.transactionNumber) && (ts1.operationIndex < ts2.operationIndex));
}

/**
 * Information about a write operation relevant for maintaining OperationProcessor state.
 */
interface OperationInfo {
  readonly batchFileHash: string;
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

  public constructor (private readonly cas: Cas, private didMethodName: string) {
  }

  /**
   * Processes a specified DID state changing operation.
   * @returns Hash of the operation if:
   *            1. The operation (of the same hash) is not process before; or
   *            2. The operation is processed before but this operation has an earlier timestamp.
   *          Returns undefined if the same operation with an earlier timestamp was processed previously.
   */
  public process (operation: WriteOperation): string | undefined {
    const opHash = OperationProcessorImpl.getHash(operation);

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

    // opInfo is operation with derivable properties projected out
    const opTimestamp: OperationTimestamp = {
      transactionTime: operation.transactionTime,
      transactionNumber: operation.transactionNumber,
      operationIndex: operation.operationIndex
    };

    const opInfo: OperationInfo = {
      batchFileHash: operation.batchFileHash,
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
    this.processInternal(opHash, opInfo);

    return opHash;
  }

  /**
   * Remove all previously processed operations
   * with transactionNumber greater than or equal to the provided transaction number.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   *
   * The current implementation is inefficient: It simply scans the two
   * hashmaps storing the core Did state and removes all entries with
   * a greater transaction number.  In future, the implementation should be optimized
   * for the common case by keeping a sliding window of recent operations.
   */
  public rollback (transactionNumber: number) {

    // Iterate over all operations and remove those with with
    // transactionNumber greater or equal to the provided parameter.
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
  }

  /**
   * Resolve the given DID to its DID Doducment.
   * @param did The DID to resolve. e.g. did:sidetree:abc123.
   * @returns DID Document of the given DID. Undefined if the DID is deleted or not found.
   */
  public async resolve (did: string): Promise<DidDocument | undefined> {
    const didUniquePortion = did.substring(this.didMethodName.length);

    if (this.deletedDids.has(did)) {
      return undefined;
    }

    const latestVersion = await this.last(didUniquePortion);

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
    const op = await this.getOperation(opInfo);

    if (this.isInitialVersion(opInfo)) {
      return WriteOperation.toDidDocument(op, this.didMethodName);
    } else {
      const prevVersion = op.previousOperationHash!;
      const prevDidDoc = await this.lookup(prevVersion);
      if (prevDidDoc === undefined) {
        return undefined;
      } else {
        return WriteOperation.applyJsonPatchToDidDocument(prevDidDoc, op.patch!);
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
   * Get a cryptographic hash of the write operation.
   * In the case of a Create operation, the hash is calculated against the initial encoded create payload (DID Document),
   * for all other cases, the hash is calculated against the entire opeartion buffer.
   */
  private static getHash (operation: WriteOperation): OperationHash {
    // TODO: Can't hardcode hashing algorithm. Need to depend on protocol version.
    const sha256HashCode = 18;

    let contentBuffer;
    if (operation.type === OperationType.Create) {
      contentBuffer = Buffer.from(operation.encodedPayload);
    } else {
      contentBuffer = operation.operationBuffer;
    }

    const multihash = Multihash.hash(contentBuffer, sha256HashCode);
    const multihashBase58 = Base58.encode(multihash);
    return multihashBase58;
  }

  /**
   * Return true if the provided operation is an initial version i.e.,
   * produced by a create operation.
   */
  private isInitialVersion (opInfo: OperationInfo): boolean {
    return opInfo.type === OperationType.Create;
  }

  /**
   * Return the operation given its (access) info.
   */
  private async getOperation (opInfo: OperationInfo): Promise<WriteOperation> {
    const batchBuffer = await this.cas.read(opInfo.batchFileHash);
    const batchFile = BatchFile.fromBuffer(batchBuffer);
    const operationBuffer = batchFile.getOperationBuffer(opInfo.timestamp.operationIndex);
    const resolvedTransaction = {
      transactionNumber: opInfo.timestamp.transactionNumber,
      transactionTime: opInfo.timestamp.transactionTime,
      transactionTimeHash: 'NOT_NEEDED',
      anchorFileHash: 'NOT_NEEDED',
      batchFileHash: opInfo.batchFileHash
    };

    return WriteOperation.create(
      operationBuffer,
      resolvedTransaction,
      opInfo.timestamp.operationIndex);
  }

  private processInternal (opHash: OperationHash, opInfo: OperationInfo): void {
    // Create operation (which has no parents) is handled differently from the other
    // operations which do have parents.
    if (opInfo.type === OperationType.Create) {
      this.processCreateOperation(opHash, opInfo);
    } else {
      this.processOperationWithParent(opHash, opInfo);
    }

    // Process operations waiting on this operation
    this.processDescendantsWaitingOn(opHash);
  }

  private processCreateOperation (_opHash: OperationHash, opInfo: OperationInfo): void {
    // TODO: Validate create operation (verify signature)
    opInfo.status = OperationStatus.Valid;
  }

  private processOperationWithParent (opHash: OperationHash, opInfo: OperationInfo): void {
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
    if (!this.validate(opHash, opInfo)) {
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

  private validate (_opHash: OperationHash, opInfo: OperationInfo): boolean {
    const parentOpHash = opInfo.parent!;
    const parentOpInfo = this.opHashToInfo.get(parentOpHash)!;

    if (!earlier(parentOpInfo.timestamp, opInfo.timestamp)) {
      return false;
    }

    // TODO Perform:
    // - operation number validation
    // - signature verification

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

  private processDescendantsWaitingOn (opHash: OperationHash) {
    const waitingDescendants = this.waitingDescendants.get(opHash);
    if (waitingDescendants === undefined) {
      return;
    }

    for (const descendantHash in waitingDescendants) {
      const descendantInfo = this.opHashToInfo.get(descendantHash)!;
      // assert: descendantInfo.status === Unvalidated and descendantInfo.missingAncestor === opHash
      this.processInternal(descendantHash, descendantInfo);
    }
  }
}

/**
 * Factory function for creating a operation processor
 */
export function createOperationProcessor (cas: Cas, didMethodName: string): OperationProcessor {
  return new OperationProcessorImpl(cas, didMethodName);
}
