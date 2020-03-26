import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BitcoinLockTransactionModel from '../../../lib/bitcoin/models/BitcoinLockTransactionModel';
import BitcoinTransactionModel from '../../../lib/bitcoin/models/BitcoinTransactionModel';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import LockMonitor from '../../../lib/bitcoin/lock/LockMonitor';
import LockResolver from '../../../lib/bitcoin/lock/LockResolver';
import MongoDbLockTransactionStore from '../../../lib/bitcoin/lock/MongoDbLockTransactionStore';
import SavedLockedModel from '../../../lib/bitcoin/models/SavedLockedModel';
import SavedLockType from '../../../lib/bitcoin/enums/SavedLockType';
import SidetreeError from '../../../lib/common/SidetreeError';
import ValueTimeLockModel from '../../../lib/common/models/ValueTimeLockModel';

function createLockState (latestSavedLockInfo: SavedLockedModel | undefined, activeValueTimeLock: ValueTimeLockModel | undefined, status: any) {
  return {
    activeValueTimeLock: activeValueTimeLock,
    latestSavedLockInfo: latestSavedLockInfo,
    status: status
  };
}

describe('LockMonitor', () => {

  const validTestWalletImportString = 'cTpKFwqu2HqW4y5ByMkNRKAvkPxEcwpax5Qr33ibYvkp1KSxdji6';

  const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1, 0);
  const mongoDbLockStore = new MongoDbLockTransactionStore('server-url', 'db');
  const lockResolver = new LockResolver(bitcoinClient, 500, 600);

  let lockMonitor: LockMonitor;

  beforeEach(() => {
    lockMonitor = new LockMonitor(bitcoinClient, mongoDbLockStore, lockResolver, 60, 1200, 100, 2000);
    lockMonitor['initialized'] = true;
  });

  describe('constructor', () => {
    it('should throw if the desired lock amount is not a whole number', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => new LockMonitor(bitcoinClient, mongoDbLockStore, lockResolver, 10, 1000.34, 25, 1234),
        ErrorCode.LockMonitorDesiredLockAmountIsNotWholeNumber);
    });

    it('should throw if the txn fees amount is not a whole number', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => new LockMonitor(bitcoinClient, mongoDbLockStore, lockResolver, 10, 1000, 1234.56, 45),
        ErrorCode.LockMonitorTransactionFeesAmountIsNotWholeNumber);
    });

    it('should set the initialized flag to false', () => {
      const monitor = new LockMonitor(bitcoinClient, mongoDbLockStore, lockResolver, 10, 1000, 1200, 45);
      expect(monitor['initialized']).toBeFalsy();
    });
  });

  describe('initialize', () => {
    it('should call the periodic poll function', async () => {
      const mockLockInfo = createLockState(undefined, undefined, 'none');
      const resolveSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockLockInfo));
      const pollSpy = spyOn(lockMonitor as any, 'periodicPoll').and.returnValue(Promise.resolve());

      lockMonitor['initialized'] = false;
      await lockMonitor.initialize();

      expect(resolveSpy).toHaveBeenCalledBefore(pollSpy);
      expect(pollSpy).toHaveBeenCalled();
      expect(lockMonitor['initialized']).toBeTruthy();
    });
  });

  describe('periodicPoll', () => {
    it('should call setTimeout() at the end of the execution.', async () => {
      const clearTimeoutSpy = spyOn(global, 'clearTimeout').and.returnValue();
      const handlePollingSpy = spyOn(lockMonitor as any, 'handlePeriodicPolling').and.returnValue(Promise.resolve());

      const setTimeoutOutput: NodeJS.Timeout = 12344 as any;
      const setTimeoutSpy = spyOn(global, 'setTimeout').and.returnValue(setTimeoutOutput as any);

      const mockPeriodicPollTimeoutId: NodeJS.Timeout = 98765 as any;
      lockMonitor['periodicPollTimeoutId'] = mockPeriodicPollTimeoutId;
      await lockMonitor['periodicPoll']();

      expect(clearTimeoutSpy).toHaveBeenCalledBefore(setTimeoutSpy);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockPeriodicPollTimeoutId);
      expect(handlePollingSpy).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(lockMonitor['periodicPollTimeoutId']).toEqual(setTimeoutOutput);
    });

    it('should rethrow if the initialize flag is not true', async (done) => {
      const mockErrorCode = 'error during initialization';
      spyOn(lockMonitor as any, 'handlePeriodicPolling').and.callFake(() => {
        throw new SidetreeError(mockErrorCode);
      });

      const setTimeoutSpy = spyOn(global, 'setTimeout').and.returnValue(123456 as any);

      lockMonitor['periodicPollTimeoutId'] = undefined;
      lockMonitor['initialized'] = false;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockMonitor['periodicPoll'](),
        mockErrorCode);

      expect(setTimeoutSpy).toHaveBeenCalled();
      done();
    });

    it('should call setTimeout() at the end of the execution even if an exception is thrown.', async () => {
      const handlePollingSpy = spyOn(lockMonitor as any, 'handlePeriodicPolling').and.throwError('unhandled exception');

      const setTimeoutOutput = 985023;
      const setTimeoutSpy = spyOn(global, 'setTimeout').and.returnValue(setTimeoutOutput as any);

      lockMonitor['periodicPollTimeoutId'] = undefined;
      lockMonitor['initialized'] = true;
      await lockMonitor['periodicPoll']();

      expect(handlePollingSpy).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('getCurrentValueTimeLock', () => {
    it('should return undefined if there is no current lock', () => {
      lockMonitor['currentLockState'] = createLockState(undefined, undefined, 'none');

      const actual = lockMonitor.getCurrentValueTimeLock();
      expect(actual).toBeUndefined();
    });

    it('should throw if the current lock status is pending', () => {
      lockMonitor['currentLockState'] = createLockState(undefined, undefined, 'pending');

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => lockMonitor.getCurrentValueTimeLock(),
        ErrorCode.LockMonitorCurrentValueTimeLockInPendingState);
    });

    it('should return the current value time lock', () => {
      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      lockMonitor['currentLockState'] = createLockState(undefined, mockCurrentValueLock, 'confirmed');

      const actual = lockMonitor.getCurrentValueTimeLock();
      expect(actual).toEqual(mockCurrentValueLock);
    });
  });

  describe('handlePeriodicPolling', () => {
    it('should only update the lock state if the current lock status is pending.', async () => {
      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      const mockCurrentLockInfo = createLockState(undefined, mockCurrentValueLock, 'pending');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState');
      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock');

      lockMonitor['desiredLockAmountInSatoshis'] = 1000;
      await lockMonitor['handlePeriodicPolling']();

      expect(resolveCurrentLockSpy).toHaveBeenCalled();
      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
    });

    it('should not do anything if a lock is not required and none exist.', async () => {
      const mockCurrentLockInfo = createLockState(undefined, undefined, 'none');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState');
      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock');

      lockMonitor['desiredLockAmountInSatoshis'] = 0;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).not.toHaveBeenCalled();
    });

    it('should call the new lock routine if a lock is required but does not exist.', async () => {
      const mockCurrentLockInfo = createLockState(undefined, undefined, 'none');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const mockSavedLock: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock').and.returnValue(Promise.resolve(mockSavedLock));
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock');

      lockMonitor['desiredLockAmountInSatoshis'] = 50;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalled();
    });

    it('should call the renew lock routine if a lock is required and one does exist.', async () => {

      const mockSavedLock: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      const mockCurrentLockInfo = createLockState(mockSavedLock, mockCurrentValueLock, 'confirmed');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal').and.returnValue(Promise.resolve(true));
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock');

      lockMonitor['desiredLockAmountInSatoshis'] = 50;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalled();
    });

    it('should not resolve the current lock information if the renew routine returns false.', async () => {

      const mockSavedLock: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      const mockCurrentLockInfo = createLockState(mockSavedLock, mockCurrentValueLock, 'confirmed');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal').and.returnValue(Promise.resolve(false));
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock');

      lockMonitor['desiredLockAmountInSatoshis'] = 50;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).not.toHaveBeenCalled();
    });

    it('should call the release lock routine if a lock is not required but one does exist.', async () => {

      const mockSavedLock: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      const mockCurrentLockInfo = createLockState(mockSavedLock, mockCurrentValueLock, 'confirmed');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock').and.returnValue(Promise.resolve(true));

      lockMonitor['desiredLockAmountInSatoshis'] = 0;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalled();
    });

    it('should not resolve current lock if the the release lock routine returns false.', async () => {

      const mockSavedLock: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323,
        lockTransactionTime: 1220
      };

      const mockCurrentLockInfo = createLockState(mockSavedLock, mockCurrentValueLock, 'confirmed');
      lockMonitor['currentLockState'] = mockCurrentLockInfo;

      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'getCurrentLockState').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'handleReleaseExistingLock').and.returnValue(Promise.resolve(false));

      lockMonitor['desiredLockAmountInSatoshis'] = 0;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).toHaveBeenCalled();
      expect(resolveCurrentLockSpy).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentLockState', () => {
    it('should return an empty object if no locks were found in the db.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction');
      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError');

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(undefined));

      const expected = createLockState(undefined, undefined, 'none');
      const actual = await lockMonitor['getCurrentLockState']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).not.toHaveBeenCalled();
    });

    it('should rebroadcast if the last lock transaction is not yet broadcasted.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());
      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError');

      const mockLastLock: SavedLockedModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionBroadcasted').and.returnValue(Promise.resolve(false));

      const expected = createLockState(mockLastLock, undefined, 'pending');
      const actual = await lockMonitor['getCurrentLockState']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).toHaveBeenCalled();
      expect(resolveLockSpy).not.toHaveBeenCalled();
    });

    it('should just return without resolving anything if the last transaction was return-to-wallet.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());
      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError');

      const mockLastLock: SavedLockedModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.ReturnToWallet
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionBroadcasted').and.returnValue(Promise.resolve(true));

      const expected = createLockState(mockLastLock, undefined, 'none');
      const actual = await lockMonitor['getCurrentLockState']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).not.toHaveBeenCalled();
    });

    it('should return the resolved output.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 1234,
        lockTransactionTime: 1220
      };
      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError').and.returnValue(Promise.resolve(mockValueTimeLock));

      const mockLastLock: SavedLockedModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Relock
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionBroadcasted').and.returnValue(Promise.resolve(true));

      const expected = createLockState(mockLastLock, mockValueTimeLock, 'confirmed');
      const actual = await lockMonitor['getCurrentLockState']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).toHaveBeenCalled();
    });

    it('should return pending if the lock resolver throws not-confirmed error.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());

      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError').and.callFake(() => {
        throw new SidetreeError(ErrorCode.LockResolverTransactionNotConfirmed);
      });

      const mockLastLock: SavedLockedModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Relock
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionBroadcasted').and.returnValue(Promise.resolve(true));

      const expected = createLockState(mockLastLock, undefined, 'pending');
      const actual = await lockMonitor['getCurrentLockState']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).toHaveBeenCalled();
    });

    it('should bubble up any unhandled exceptions.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());

      const mockErrorCode = 'some other unhandled error code';
      const resolveLockSpy = spyOn(lockResolver, 'resolveLockIdentifierAndThrowOnError').and.callFake(() => {
        throw new SidetreeError(mockErrorCode);
      });

      const mockLastLock: SavedLockedModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Relock
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));
      spyOn(lockMonitor as any, 'isTransactionBroadcasted').and.returnValue(Promise.resolve(true));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockMonitor['getCurrentLockState'](),
        mockErrorCode);

      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).toHaveBeenCalled();
    });
  });

  describe('rebroadcastTransaction', () => {
    it('should broadcast the txn via bitcoin-client', async () => {
      const lastSavedLockInput: SavedLockedModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 500,
        rawTransaction: 'raw txn',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const broadcastSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction').and.returnValue(Promise.resolve(''));

      await lockMonitor['rebroadcastTransaction'](lastSavedLockInput);

      const expectedRebroadcastLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: lastSavedLockInput.redeemScriptAsHex,
        serializedTransactionObject: lastSavedLockInput.rawTransaction,
        transactionId: lastSavedLockInput.transactionId,
        transactionFee: 0
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expectedRebroadcastLockTxn);
    });
  });

  describe('isTransactionBroadcasted', () => {
    it('should return true if the bitcoin client returns the transaction', async () => {
      const mockTxn: BitcoinTransactionModel = { id: 'id', blockHash: 'block hash', confirmations: 5, inputs: [], outputs: [] };
      spyOn(lockMonitor['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTxn));

      const actual = await lockMonitor['isTransactionBroadcasted']('input id');
      expect(actual).toBeTruthy();
    });

    it('should return false if there is an exception thrown by the bitcoin client', async () => {
      spyOn(lockMonitor['bitcoinClient'], 'getRawTransaction').and.throwError('not found error.');

      const actual = await lockMonitor['isTransactionBroadcasted']('input id');
      expect(actual).toBeFalsy();
    });
  });

  describe('handleCreatingNewLock', () => {
    it('should create the first lock', async () => {
      // Make sure that there's enough wallet balance available
      const mockWalletBalance = 32430234 + lockMonitor['transactionFeesAmountInSatoshis'] + 200;
      spyOn(lockMonitor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(mockWalletBalance));

      const mockCurrentBlockHeight = 455678;
      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockCurrentBlockHeight));

      const mockLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'renew lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };
      const createLockTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'createLockTransaction').and.returnValue(Promise.resolve(mockLockTxn));

      const mockLockInfoSaved: SavedLockedModel = {
        desiredLockAmountInSatoshis: 125,
        createTimestamp: Date.now(),
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any,'saveThenBroadcastTransaction').and.returnValue(Promise.resolve(mockLockInfoSaved));

      const desiredLockAmount = mockWalletBalance - (mockWalletBalance * 0.5);
      const actual = await lockMonitor['handleCreatingNewLock'](desiredLockAmount);

      expect(actual).toEqual(mockLockInfoSaved);

      const expectedLockAmount = desiredLockAmount + lockMonitor['transactionFeesAmountInSatoshis'];
      const expectedLockUntilBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createLockTxnSpy).toHaveBeenCalledWith(expectedLockAmount, expectedLockUntilBlock);

      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockLockTxn, SavedLockType.Create, desiredLockAmount);
    });

    it('should throw if the wallet balance is less than the desired lock amount', async () => {
      const mockWalletBalance = 32430234;
      spyOn(lockMonitor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(mockWalletBalance));

      const desiredLockAmount = mockWalletBalance - lockMonitor['transactionFeesAmountInSatoshis'];
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockMonitor['handleCreatingNewLock'](desiredLockAmount),
        ErrorCode.LockMonitorNotEnoughBalanceForFirstLock);
    });
  });

  describe('handleExistingLockRenewal', () => {
    it('should return if the we have not reached the unlock block yet.', async () => {

      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime,
        lockTransactionTime: 1220
      };

      const lastSavedLockInfoInput: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: currentValueTimeLockInput.amountLocked,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      // Make sure we mock not reaching the unlock time just yet.
      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(false));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewLock');

      const actual = await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, 50);

      expect(actual).toBeFalsy();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(renewLockSpy).not.toHaveBeenCalled();
    });

    it('should call release lock if the new desired lock amount is different than the previously saved one.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime,
        lockTransactionTime: 1220
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(true));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock').and.returnValue(Promise.resolve());
      const renewLockSpy = spyOn(lockMonitor as any, 'renewLock');

      const actual = await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount - 1);

      expect(actual).toBeTruthy();
      expect(releaseLockSpy).toHaveBeenCalled();
      expect(renewLockSpy).not.toHaveBeenCalled();
    });

    it('should call renew lock if we are at the unlock block and the desired lock amount is same as the last time.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime,
        lockTransactionTime: 1220
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(true));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewLock').and.returnValue(Promise.resolve());

      const actual = await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount);

      expect(actual).toBeTruthy();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(renewLockSpy).toHaveBeenCalled();
    });

    it('should call release lock if we do not have enough balance for relock.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime,
        lockTransactionTime: 1220
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(true));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock').and.returnValue(Promise.resolve());
      const renewLockSpy = spyOn(lockMonitor as any, 'renewLock');
      renewLockSpy.and.callFake(() => {
        throw new SidetreeError(ErrorCode.LockMonitorNotEnoughBalanceForRelock);
      });

      const actual = await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount);

      expect(actual).toBeTruthy();
      expect(renewLockSpy).toHaveBeenCalledBefore(releaseLockSpy);
      expect(releaseLockSpy).toHaveBeenCalled();
    });

    it('should just bubble up any unhandled errors.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime,
        lockTransactionTime: 1220
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(true));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock');

      const mockUnhandledError = new SidetreeError('some unhandled error');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewLock');
      renewLockSpy.and.callFake(() => {
        throw mockUnhandledError;
      });

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount),
        mockUnhandledError.code
      );

      expect(renewLockSpy).toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleReleaseExistingLock', () => {
    it('should not call the renew lock routine if the lock time has not reached.', async () => {
      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(false));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock');

      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: 12345,
        lockTransactionTime: 1220
      };

      const actual = await lockMonitor['handleReleaseExistingLock'](currentValueTimeLockInput, 400);
      expect(actual).toBeFalsy();
      expect(releaseLockSpy).not.toHaveBeenCalled();
    });

    it('should call the renew lock routine if the lock time has reached.', async () => {

      spyOn(lockMonitor as any, 'isUnlockTimeReached').and.returnValue(Promise.resolve(true));

      const mockLastSavedLockInfo: SavedLockedModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: 3455,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: SavedLockType.Create
      };

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLock').and.returnValue(Promise.resolve(mockLastSavedLockInfo));

      const lastSavedDesiredLockAmountInput = 500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: 12345,
        lockTransactionTime: 1220
      };

      const actual = await lockMonitor['handleReleaseExistingLock'](currentValueTimeLockInput, lastSavedDesiredLockAmountInput);
      expect(actual).toBeTruthy();
      expect(releaseLockSpy).toHaveBeenCalledWith(currentValueTimeLockInput, lastSavedDesiredLockAmountInput);
    });
  });

  describe('renewLock', () => {
    it('should renew the existing lock and save the updated information to the db', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id'
      };

      spyOn(LockIdentifierSerializer, 'deserialize').and.returnValue(mockCurrentLockId);

      const mockCurrentBlockHeight = 455678;
      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockCurrentBlockHeight));

      const mockRenewLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'renew lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };

      const createRelockTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'createRelockTransaction').and.returnValue(Promise.resolve(mockRenewLockTxn));

      const mockLockInfo: SavedLockedModel = {
        desiredLockAmountInSatoshis: 2345,
        createTimestamp: 12323425,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.ReturnToWallet
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveThenBroadcastTransaction').and.returnValue(mockLockInfo);

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        unlockTransactionTime: 1234,
        owner: 'some - owner',
        lockTransactionTime: 1220
      };

      // Ensure that the desired lock amount is not too much.
      const desiredLockAmountInput = currentLockInfoInput.amountLocked - mockRenewLockTxn.transactionFee;
      const actual = await lockMonitor['renewLock'](currentLockInfoInput, desiredLockAmountInput);

      expect(actual).toEqual(mockLockInfo);

      const expectedNewLockBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createRelockTxnSpy).toHaveBeenCalledWith(mockCurrentLockId.transactionId, currentLockInfoInput.unlockTransactionTime, expectedNewLockBlock);
      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockRenewLockTxn, SavedLockType.Relock, desiredLockAmountInput);
    });

    it('should throw if the renew fees are causing the new lock amount to be less than the desired lock.', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id'
      };

      spyOn(LockIdentifierSerializer, 'deserialize').and.returnValue(mockCurrentLockId);

      const mockCurrentBlockHeight = 455678;
      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockCurrentBlockHeight));

      const mockRenewLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'renew lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };

      spyOn(lockMonitor['bitcoinClient'], 'createRelockTransaction').and.returnValue(Promise.resolve(mockRenewLockTxn));
      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveThenBroadcastTransaction');

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        owner: 'wallet address',
        unlockTransactionTime: 1234,
        lockTransactionTime: 1220
      };

      // Ensure that the desired lock amount is more to cause the error
      const desiredLockAmountInput = currentLockInfoInput.amountLocked + mockRenewLockTxn.transactionFee;

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => lockMonitor['renewLock'](currentLockInfoInput, desiredLockAmountInput),
        ErrorCode.LockMonitorNotEnoughBalanceForRelock);

      expect(saveBroadcastSpy).not.toHaveBeenCalled();
    });
  });

  describe('releaseLock', () => {
    it('should release the lock and save the updated information to the db', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id'
      };

      spyOn(LockIdentifierSerializer, 'deserialize').and.returnValue(mockCurrentLockId);

      const mockReleaseLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'release lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };

      spyOn(lockMonitor['bitcoinClient'], 'createReleaseLockTransaction').and.returnValue(Promise.resolve(mockReleaseLockTxn));

      const mockLockInfo: SavedLockedModel = {
        desiredLockAmountInSatoshis: 2345,
        createTimestamp: 12323425,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockType.ReturnToWallet
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveThenBroadcastTransaction').and.returnValue(mockLockInfo);

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'abc',
        owner: 'wallet address',
        unlockTransactionTime: 1234,
        lockTransactionTime: 1220
      };

      const desiredLockAmountInput = 2500;
      const actual = await lockMonitor['releaseLock'](currentLockInfoInput, desiredLockAmountInput);
      expect(actual).toEqual(mockLockInfo);
      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockReleaseLockTxn, SavedLockType.ReturnToWallet, desiredLockAmountInput);
    });
  });

  describe('saveThenBroadcastTransaction', () => {
    it('save the transaction first and then broadcast it.', async () => {

      const mockBitcoinLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'redeem script hex',
        serializedTransactionObject: 'serialized txn object',
        transactionFee: 132,
        transactionId: 'transaction id'
      };

      const mockDateValue = Date.now();
      spyOn(Date,'now').and.returnValue(mockDateValue);

      const lockStoreSpy = spyOn(lockMonitor['lockTransactionStore'], 'addLock').and.returnValue(Promise.resolve());
      const broadcastTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction').and.returnValue(Promise.resolve('id'));

      const desiredLockAmtInput = 98985;
      const lockTxnTypeInput = SavedLockType.Relock;

      const actual = await lockMonitor['saveThenBroadcastTransaction'](mockBitcoinLockTxn, lockTxnTypeInput, desiredLockAmtInput);

      const expectedLockSaved: SavedLockedModel = {
        desiredLockAmountInSatoshis: desiredLockAmtInput,
        rawTransaction: mockBitcoinLockTxn.serializedTransactionObject,
        createTimestamp: mockDateValue,
        redeemScriptAsHex: mockBitcoinLockTxn.redeemScriptAsHex,
        transactionId: mockBitcoinLockTxn.transactionId,
        type: lockTxnTypeInput
      };

      expect(actual).toEqual(expectedLockSaved);
      expect(lockStoreSpy).toHaveBeenCalledWith(expectedLockSaved);
      expect(lockStoreSpy).toHaveBeenCalledBefore(broadcastTxnSpy);
      expect(broadcastTxnSpy).toHaveBeenCalledWith(mockBitcoinLockTxn);
    });
  });

  describe('isUnlockTimeReached', () => {
    it('should return true if we at the unlock block', async (done) => {
      const mockUnlockTime = 12345;

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTime));

      const actual = await lockMonitor['isUnlockTimeReached'](mockUnlockTime);
      expect(actual).toBeTruthy();
      done();
    });

    it('should return false if we are below the unlock block', async (done) => {
      const mockUnlockTime = 12345;

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTime - 1));

      const actual = await lockMonitor['isUnlockTimeReached'](mockUnlockTime);
      expect(actual).toBeFalsy();
      done();
    });
  });
});
