import { DidDocument } from '@decentralized-identity/did-common-typescript';
import * as Base58 from 'bs58';
import { Cas } from './Cas';
import Multihash from './Multihash';
import { WriteOperation, OperationType } from './Operation';

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
 */
export type VersionId = string;

/**
 * Alias OperationHash to string - see comment above
 */
export type OperationHash = string;

/**
 * Function type that updates a Did document given an operation. This would be instantiated
 * with a function that implements json patch application. Using the interface instead of
 * the actual function hides details of json patching from Did cache.
 */
export interface DidDocumentGenerator {
  /**
   * Update a DID document given an operation over it.
   */
  (didDoc: DidDocument, operation: WriteOperation): DidDocument;

  /**
   * For a create operation, return the initial DID document.
   */
  (createOp: WriteOperation): DidDocument;
}

/**
 * The timestamp of an operation. We define a linear ordering of
 * timestamps using the function lesser below.
 */
interface OperationTimestamp {
  readonly transactionNumber: number;
  readonly operationIndex: number;
}

function lesser (ts1: OperationTimestamp, ts2: OperationTimestamp): boolean {
  return ((ts1.transactionNumber < ts2.transactionNumber) ||
          (ts1.transactionNumber === ts2.transactionNumber) && (ts1.operationIndex < ts2.operationIndex));
}

/**
 * Information about a write operation relevant for the DID cache, a subset of the properties exposed by
 * WriteOperation.
 */
interface OperationInfo extends OperationTimestamp {
  readonly batchFileHash: string;
  readonly type: OperationType;
}

/**
 * DIDCache is a singleton class whose instance holds most of the state in Sidetree node.
 * It exposes methods to record sidetree DID state changes (create, update, delete, recover)
 * and methods to retrieve current and historical states of a DID document.
 *
 * The current implementation is a main-memory implementation without any persistence. This
 * means that when a node is powered down and restarted DID operations need to be applied
 * from the beginning of time. This implementation will be extended in the future to support
 * persistence.
 */
export class DidCache {
  /**
   * Map a versionId to the next versionId whenever one exists.
   */
  private nextVersion: Map<VersionId, VersionId> = new Map();

  /**
   * Map a operation hash to the OperationInfo which contains sufficient
   * information to reconstruct the operation.
   */
  private opHashToInfo: Map<OperationHash, OperationInfo> = new Map();

  /**
   * Apply (perform) a specified DID state changing operation.
   */
  public apply (operation: WriteOperation): string | null {
    const opHash = DidCache.getHash(operation);

    // Ignore operations without the required metadata - any operation anchored
    // in a blockchain should have this metadata.
    if (!operation.transactionNumber || !operation.operationIndex || !operation.batchFileHash) {
      return null;
    }

    // opInfo is operation with derivable properties projected out
    const opInfo: OperationInfo = {
      transactionNumber: operation.transactionNumber,
      operationIndex: operation.operationIndex,
      batchFileHash: operation.batchFileHash,
      type: operation.type
    };

    // If this is a duplicate of an earlier operation, we can
    // ignore this operation. Note that we might have a previous
    // operation with the same hash, but that previous operation
    // need not be earlier in timestamp order - hence the check
    // with lesser().
    const prevOperation = this.opHashToInfo.get(opHash);
    if (prevOperation !== undefined && lesser(prevOperation, opInfo)) {
      return null;
    }
    // Update our mapping of operation hash to operation info overwriting
    // previous info if it exists
    this.opHashToInfo.set(opHash, opInfo);

    // For operations that have a previous version, we need additional
    // bookkeeping
    if (operation.previousOperationHash) {
      this.applyOpWithPrev(opHash, opInfo, operation.previousOperationHash);
    }

    return opHash;
  }

  public constructor (private readonly cas: Cas, private readonly didDocGen: DidDocumentGenerator) {

  }

  /**
   * Rollback the state of the DidCache by removing all operations
   * with transactionNumber greater than the provided parameter value.
   * The intended use case for this method is to handle rollbacks
   * in the blockchain.
   *
   * The current implementation is inefficient: It simply scans the two
   * hashmaps storing the core Did state and removes all entries with
   * a greater transaction number.  In future, the implementation should be optimized
   * for the common case by keeping a sliding window of recent operations.
   */
  public rollback (transactionNumber: number) {

    // Iterate over all nextVersion entries and remove all versions
    // with "next" operation with transactionNumber greater than the provided
    // parameter.
    this.nextVersion.forEach((opHash, version, map) => {
      const opInfo = this.opHashToInfo.get(opHash) as OperationInfo;
      if (opInfo.transactionNumber > transactionNumber) {
        map.delete(version);
      }
    });

    // Iterate over all operations and remove those with with
    // transactionNumber greater than the provided parameter.
    this.opHashToInfo.forEach((opInfo, opHash, map) => {
      if (opInfo.transactionNumber > transactionNumber) {
        map.delete(opHash);
      }
    });
  }

  /**
   * Returns the Did document for a given version identifier.
   */
  public async lookup (versionId: VersionId): Promise<DidDocument | null> {
    // Version id is also the operation hash that produces the document
    const opHash = versionId;

    const opInfo = this.opHashToInfo.get(opHash);

    // We don't know anything about this operation
    if (opInfo === undefined) {
      return null;
    }

    // Construct the operation using a CAS lookup
    const op = await this.getOperation(opInfo);

    if (this.isInitialVersion(opInfo)) {
      return this.didDocGen(op);
    } else {
      const prevVersion = op.previousOperationHash as VersionId;
      const prevDidDoc = await this.lookup(prevVersion);
      if (prevDidDoc === null) {
        return null;
      } else {
        return this.didDocGen(prevDidDoc, op);
      }
    }
  }

  /**
   * Get a cryptographic hash of the write operation. Currently, uses
   * SHA256 to get hashes (TODO: Fix it to be consistent DID generation)
   */
  private static getHash (operation: WriteOperation): OperationHash {
    const sha256HashCode = 18;
    const multihash = Multihash.hash(operation.operationBuffer, sha256HashCode);
    const multihashBase58 = Base58.encode(multihash);
    return multihashBase58;
  }

  /**
   * Apply state changes for operations that have a previous version (update, delete, recover)
   */
  private applyOpWithPrev (opHash: OperationHash, opInfo: OperationInfo, version: VersionId): void {
    // We might already know of an update to this version. If so, we retain
    // the older of previously known update and the current one
    const prevUpdateHash = this.nextVersion.get(version);
    if (prevUpdateHash !== undefined) {
      const prevUpdateInfo = this.opHashToInfo.get(prevUpdateHash) as OperationInfo;
      if (lesser(prevUpdateInfo, opInfo)) {
        return;
      }
    }

    this.nextVersion.set(version, opHash);
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
    const batch = batchBuffer.toJSON().data as Buffer[];
    const opBuffer = batch[opInfo.operationIndex];
    return new WriteOperation(opBuffer, opInfo.transactionNumber, opInfo.operationIndex, opInfo.batchFileHash);
  }
}
