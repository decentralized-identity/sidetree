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
type VersionId = string;
type OperationHash = string;

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

    // If this is a duplicate of an earlier operation, we can
    // ignore this operation. Note that we might have a previous
    // operation with the same hash, but that previous operation
    // need not be earlier in timestamp order - hence the check
    // with lesser().
    const prevOperation = this.opHashToInfo.get(opHash);
    if (prevOperation !== undefined && lesser(prevOperation, operation)) {
      return null;
    }
    // Update our mapping of operation hash to operation info overwriting
    // previous info if it exists
    this.opHashToInfo.set(opHash, operation);

    // For operations that have a previous version, we need additional
    // bookkeeping
    if (operation.previousOperationHash) {
      this.applyOpWithPrev(opHash, operation);
    }

    return opHash;
  }

  public constructor (private cas: Cas) {

  }

  public rollback (transactionNumber: number) {
    this.nextVersion.forEach((_, opHash, map) => {
      if (this.opHashToInfo.get(opHash))
    });
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
  private applyOpWithPrev (opHash: OperationHash, operation: WriteOperation): void {
    // VersionId being updated;
    const versionUpdated: VersionId = operation.previousOperationHash as VersionId;

    // We might already know of an update to this version. If so, we retain
    // the older of previously known update and the current one
    const prevUpdateHash = this.nextVersion.get(versionUpdated);
    if (prevUpdateHash !== undefined) {
      const prevUpdateInfo = this.opHashToInfo.get(prevUpdateHash) as OperationInfo;
      if (lesser(prevUpdateInfo, operation)) {
        return;
      }
    }

    this.nextVersion.set(versionUpdated, opHash);
  }
}
