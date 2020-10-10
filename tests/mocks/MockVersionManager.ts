import IBatchWriter from '../../lib/core/interfaces/IBatchWriter';
import IOperationProcessor from '../../lib/core/interfaces/IOperationProcessor';
import IRequestHandler from '../../lib/core/interfaces/IRequestHandler';
import ITransactionProcessor from '../../lib/core/interfaces/ITransactionProcessor';
import ITransactionSelector from '../../lib/core/interfaces/ITransactionSelector';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';

/**
 * Mock version manager for testing.
 */
export default class MockVersionManager implements IVersionManager {
  public getBatchWriter (blockchainTime: number): IBatchWriter {
    throw new Error('Not implemented. Use spyOn to override the functionality. Input: ' + blockchainTime);
  }

  public getOperationProcessor (blockchainTime: number): IOperationProcessor {
    throw new Error('Not implemented. Use spyOn to override the functionality. Input: ' + blockchainTime);
  }

  public getRequestHandler (blockchainTime: number): IRequestHandler {
    throw new Error('Not implemented. Use spyOn to override the functionality. Input: ' + blockchainTime);
  }

  public getTransactionProcessor (blockchainTime: number): ITransactionProcessor {
    throw new Error('Not implemented. Use spyOn to override the functionality. Input: ' + blockchainTime);
  }

  public getTransactionSelector (blockchainTime: number): ITransactionSelector {
    throw new Error('Not implemented. Use spyOn to override the functionality. Input: ' + blockchainTime);
  }
}
