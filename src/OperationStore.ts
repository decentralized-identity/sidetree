import BatchFile from './BatchFile';
import Logger from './lib/Logger';
import { Cache, getCache } from './Cache';
import { Cas } from './Cas';
import { WriteOperation } from './Operation';
import * as startTimer from 'time-span';

/**
 * Information of an operation that is required to reconstruct it from
 * the CAS.
 */
interface OperationAccessInfo {
  readonly batchFileHash: string;
  readonly operationIndex: number;
  readonly transactionTime: number;
  readonly transactionNumber: number;
}

/**
 * An abstraction of a *complete* store for operations, exposing methods to store and
 * subsequently retrieve operations using OperationInfo. Internally relies on a
 * cache to lookup recent and/or heavily accessed operations; on a cache miss relies on
 * an expensive CAS lookup to reconstruct the operation.
 */
export class OperationStore {
  private readonly operationCache: Cache<string, WriteOperation>;

  private readonly opHashToAccessInfo: Map<string, OperationAccessInfo> = new Map();

  // Size for the operation cache; TODO: set from a config file?
  private readonly operationCacheSize = 10000000;

  public constructor (private readonly cas: Cas) {
    this.operationCache = getCache(this.operationCacheSize);
  }

  /**
   * Store an operation in the store.
   */
  public store (opHash: string, operation: WriteOperation) {
    const operationAccessInfo: OperationAccessInfo = {
      batchFileHash: operation.batchFileHash!,
      operationIndex: operation.operationIndex!,
      transactionTime: operation.transactionTime!,
      transactionNumber: operation.transactionNumber!
    };

    this.operationCache.store(opHash, operation);
    this.opHashToAccessInfo.set(opHash, operationAccessInfo);
  }

  /**
   * Lookup an operation from the store
   */
  public async lookup (opHash: string): Promise<WriteOperation> {
    const operation = this.operationCache.lookup(opHash);

    if (operation !== undefined) {
      return operation;
    }

    return this.constructOperationFromCas(this.opHashToAccessInfo.get(opHash)!);
  }

  private async constructOperationFromCas (operationAccessInfo: OperationAccessInfo): Promise<WriteOperation> {
    const batchBuffer = await this.cas.read(operationAccessInfo.batchFileHash);

    const endTimer = startTimer();
    const batchFile = await BatchFile.fromBuffer(batchBuffer);
    const duration = endTimer();
    Logger.info(`Deserialized batch file of size ${batchBuffer.length} bytes in: ${duration} ms.`);

    const operationBuffer = batchFile.getOperationBuffer(operationAccessInfo.operationIndex);
    const resolvedTransaction = {
      transactionNumber: operationAccessInfo.transactionNumber,
      transactionTime: operationAccessInfo.transactionTime,
      transactionTimeHash: 'NOT_NEEDED',
      anchorFileHash: 'NOT_NEEDED',
      batchFileHash: operationAccessInfo.batchFileHash
    };

    const operation = WriteOperation.create(
      operationBuffer,
      resolvedTransaction,
      operationAccessInfo.operationIndex);

    return operation;
  }
}
