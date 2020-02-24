import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BitcoinError from '../../../lib/bitcoin/BitcoinError';
import BitcoinLockTransactionModel from '../../../lib/bitcoin/models/BitcoinLockTransactionModel';
import BitcoinTransactionModel from '../../../lib/bitcoin/models/BitcoinTransactionModel';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import LockMonitor from '../../../lib/bitcoin/lock/LockMonitor';
import LockTransactionModel from '../../../lib/bitcoin/models/LockTransactionModel';
import LockTransactionType from '../../../lib/bitcoin/enums/LockTransactionType';
import MongoDbLockTransactionStore from '../../../lib/bitcoin/lock/MongoDbLockTransactionStore';
import ValueTimeLockModel from '../../../lib/common/models/ValueTimeLockModel';

function createLockInformation (latestSavedLockInfo: LockTransactionModel | undefined, currentValueTimeLock: ValueTimeLockModel | undefined, state: any) {
  return {
    currentValueTimeLock: currentValueTimeLock,
    latestSavedLockInfo: latestSavedLockInfo,
    state: state
  };
}

describe('LockMonitor', () => {

  const validTestWalletImportString = 'cTpKFwqu2HqW4y5ByMkNRKAvkPxEcwpax5Qr33ibYvkp1KSxdji6';

  let lockMonitor: LockMonitor;

  beforeEach(() => {
    const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1);
    const mongoDbLockStore = new MongoDbLockTransactionStore('server-url', 'db');
    lockMonitor = new LockMonitor(bitcoinClient, mongoDbLockStore, 60, 1200, 2000);
  });

  describe('initialize', () => {
    it('should call the periodic poll function', async () => {
      const pollSpy = spyOn(lockMonitor as any, 'periodicPoll').and.returnValue(Promise.resolve());

      await lockMonitor.initialize();

      expect(pollSpy).toHaveBeenCalled();
    });
  });

  describe('PerioicPoll', () => {
    it('should call set timeout at the end of the execution.', async () => {
      const clearTimeoutSpy = spyOn(global, 'clearTimeout').and.returnValue();
      const handlePollingSpy = spyOn(lockMonitor as any, 'handlePeriodicPolling').and.returnValue(Promise.resolve());

      const setTimeoutOutput = 985023;
      const setTimeoutSpy = spyOn(global, 'setTimeout').and.returnValue(setTimeoutOutput as any);

      const mockPeriodicPollTimeoutId = 123;
      lockMonitor['periodicPollTimeoutId'] = mockPeriodicPollTimeoutId;
      await lockMonitor['periodicPoll']();

      expect(clearTimeoutSpy).toHaveBeenCalledBefore(setTimeoutSpy);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockPeriodicPollTimeoutId);
      expect(handlePollingSpy).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(lockMonitor['periodicPollTimeoutId']).toEqual(setTimeoutOutput);
    });

    it('should call set timeout at the end of the execution even if an exception is thrown.', async () => {
      const handlePollingSpy = spyOn(lockMonitor as any, 'handlePeriodicPolling').and.throwError('unhandled exception');

      const setTimeoutOutput = 985023;
      const setTimeoutSpy = spyOn(global, 'setTimeout').and.returnValue(setTimeoutOutput as any);

      lockMonitor['periodicPollTimeoutId'] = undefined;
      await lockMonitor['periodicPoll']();

      expect(handlePollingSpy).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('handlePeriodicPolling', () => {
    it('should not do anything if a lock is not required and none exist.', async () => {
      const mockCurrentLockInfo = createLockInformation(undefined, undefined, 'none');
      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'resolveCurrentValueTimeLock').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');

      lockMonitor['desiredLockAmountInSatoshis'] = 0;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalledTimes(1);
    });

    it('should call the new lock routine if a lock is required but does not exist.', async () => {
      const mockCurrentLockInfo = createLockInformation(undefined, undefined, 'none');
      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'resolveCurrentValueTimeLock').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const mockSavedLock: LockTransactionModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock').and.returnValue(Promise.resolve(mockSavedLock));
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');

      lockMonitor['desiredLockAmountInSatoshis'] = 50;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalledTimes(2);
    });

    it('should call the renew lock routine if a lock is required and one does exist.', async () => {

      const mockSavedLock: LockTransactionModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323
      };

      const mockCurrentLockInfo = createLockInformation(mockSavedLock, mockCurrentValueLock, 'confirmed');
      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'resolveCurrentValueTimeLock').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal').and.returnValue(Promise.resolve());
      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');

      lockMonitor['desiredLockAmountInSatoshis'] = 50;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalledTimes(2);
    });

    it('should call the release lock routine if a lock is not required but one does exist.', async () => {

      const mockSavedLock: LockTransactionModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 300,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      const mockCurrentValueLock: ValueTimeLockModel = {
        amountLocked: 300,
        identifier: 'identifier',
        owner: 'owner',
        unlockTransactionTime: 12323
      };

      const mockCurrentLockInfo = createLockInformation(mockSavedLock, mockCurrentValueLock, 'confirmed');
      const resolveCurrentLockSpy = spyOn(lockMonitor as any, 'resolveCurrentValueTimeLock').and.returnValue(Promise.resolve(mockCurrentLockInfo));

      const createNewLockSpy = spyOn(lockMonitor as any, 'handleCreatingNewLock');
      const existingLockSpy = spyOn(lockMonitor as any, 'handleExistingLockRenewal');
      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb').and.returnValue(Promise.resolve(mockSavedLock));

      lockMonitor['desiredLockAmountInSatoshis'] = 0;
      await lockMonitor['handlePeriodicPolling']();

      expect(createNewLockSpy).not.toHaveBeenCalled();
      expect(existingLockSpy).not.toHaveBeenCalled();
      expect(releaseLockSpy).toHaveBeenCalled();
      expect(resolveCurrentLockSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveCurrentValueTimeLock', () => {
    it('should return an empty object if no locks were found in the db.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction');
      const resolveLockSpy = spyOn(lockMonitor['lockResolver'], 'resolveLockIdentifierAndThrowOnError');

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(undefined));

      const expected = createLockInformation(undefined, undefined, 'none');
      const actual = await lockMonitor['resolveCurrentValueTimeLock']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).not.toHaveBeenCalled();
    });

    it('should rebroadcast if the last lock transaction is not found on the bitcoin network.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());
      const resolveLockSpy = spyOn(lockMonitor['lockResolver'], 'resolveLockIdentifierAndThrowOnError');

      const mockLastLock: LockTransactionModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionWrittenOnBitcoin').and.returnValue(Promise.resolve(false));

      const expected = createLockInformation(mockLastLock, undefined, 'pending');
      const actual = await lockMonitor['resolveCurrentValueTimeLock']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).toHaveBeenCalled();
      expect(resolveLockSpy).not.toHaveBeenCalled();
    });

    it('should just return without resolving anything if the last transaction was return-to-wallet.', async () => {
      const rebroadcastSpy = spyOn(lockMonitor as any, 'rebroadcastTransaction').and.returnValue(Promise.resolve());
      const resolveLockSpy = spyOn(lockMonitor['lockResolver'], 'resolveLockIdentifierAndThrowOnError');

      const mockLastLock: LockTransactionModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.ReturnToWallet
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionWrittenOnBitcoin').and.returnValue(Promise.resolve(true));

      const expected = createLockInformation(mockLastLock, undefined, 'none');
      const actual = await lockMonitor['resolveCurrentValueTimeLock']();

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
        unlockTransactionTime: 1234
      };
      const resolveLockSpy = spyOn(lockMonitor['lockResolver'], 'resolveLockIdentifierAndThrowOnError').and.returnValue(Promise.resolve(mockValueTimeLock));

      const mockLastLock: LockTransactionModel = {
        createTimestamp: 121314,
        desiredLockAmountInSatoshis: 98974,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Relock
      };

      spyOn(lockMonitor['lockTransactionStore'], 'getLastLock').and.returnValue(Promise.resolve(mockLastLock));

      spyOn(lockMonitor as any, 'isTransactionWrittenOnBitcoin').and.returnValue(Promise.resolve(true));

      const expected = createLockInformation(mockLastLock, mockValueTimeLock, 'confirmed');
      const actual = await lockMonitor['resolveCurrentValueTimeLock']();

      expect(actual).toEqual(expected);
      expect(rebroadcastSpy).not.toHaveBeenCalled();
      expect(resolveLockSpy).toHaveBeenCalled();
    });
  });

  describe('rebroadcastTransaction', () => {
    it('should broadcast the txn via bitcoin-client', async () => {
      const lastSavedLockInput: LockTransactionModel = {
        createTimestamp: 1212,
        desiredLockAmountInSatoshis: 500,
        rawTransaction: 'raw txn',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
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

  describe('isTransactionWrittenOnBitcoin', () => {
    it('should return true if the bitcoin client returns the transaction', async () => {
      const mockTxn: BitcoinTransactionModel = { id: 'id', inputs: [], outputs: [] };
      spyOn(lockMonitor['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTxn));

      const actual = await lockMonitor['isTransactionWrittenOnBitcoin']('input id');
      expect(actual).toBeTruthy();
    });

    it('should return false if there is an exception thrown by the bitcoin client', async () => {
      spyOn(lockMonitor['bitcoinClient'], 'getRawTransaction').and.throwError('not found error.');

      const actual = await lockMonitor['isTransactionWrittenOnBitcoin']('input id');
      expect(actual).toBeFalsy();
    });
  });

  describe('handleCreatingNewLock', () => {
    it('should create the first lock', async () => {
      // Make sure that there's enough wallet balance available
      const mockWalletBalance = 32430234 + lockMonitor['firstLockFeeAmountInSatoshis'] + 200;
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

      const mockLockInfoSaved: LockTransactionModel = {
        desiredLockAmountInSatoshis: 125,
        createTimestamp: Date.now(),
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any,'saveAndThenBroadcastTransaction').and.returnValue(Promise.resolve(mockLockInfoSaved));

      const desiredLockAmount = mockWalletBalance - (mockWalletBalance * 0.5);
      const actual = await lockMonitor['handleCreatingNewLock'](desiredLockAmount);

      expect(actual).toEqual(mockLockInfoSaved);

      const expectedLockAmount = desiredLockAmount + lockMonitor['firstLockFeeAmountInSatoshis'];
      const expectedLockUntilBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createLockTxnSpy).toHaveBeenCalledWith(expectedLockAmount, expectedLockUntilBlock);

      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockLockTxn, LockTransactionType.Create, desiredLockAmount);
    });

    it('should throw if the wallet balance is less than the desired lock amount', async () => {
      const mockWalletBalance = 32430234;
      spyOn(lockMonitor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(mockWalletBalance));

      const desiredLockAmount = mockWalletBalance - lockMonitor['firstLockFeeAmountInSatoshis'];
      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
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
        unlockTransactionTime: mockUnlockTxnTime
      };

      const lastSavedLockInfoInput: LockTransactionModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: currentValueTimeLockInput.amountLocked,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      // Make sure we mock not reaching the unlock time just yet.
      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTxnTime - 2));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewExistingLockAndSaveItToDb');

      await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, 50);

      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(renewLockSpy).not.toHaveBeenCalled();
    });

    it('should call release lock if the new desired lock amount is different than the previously saved one.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: LockTransactionModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTxnTime));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb').and.returnValue(Promise.resolve());
      const renewLockSpy = spyOn(lockMonitor as any, 'renewExistingLockAndSaveItToDb');

      await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount - 1);

      expect(releaseLockSpy).toHaveBeenCalled();
      expect(renewLockSpy).not.toHaveBeenCalled();
    });

    it('should call renew lock if we are at the unlock block and the desired lock amount is same as the last time.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: LockTransactionModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTxnTime));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewExistingLockAndSaveItToDb').and.returnValue(Promise.resolve());

      await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount);

      expect(releaseLockSpy).not.toHaveBeenCalled();
      expect(renewLockSpy).toHaveBeenCalled();
    });

    it('should call release lock if we do not have enough balance for relock.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: LockTransactionModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTxnTime));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb').and.returnValue(Promise.resolve());
      const renewLockSpy = spyOn(lockMonitor as any, 'renewExistingLockAndSaveItToDb');
      renewLockSpy.and.callFake(() => {
        throw new BitcoinError(ErrorCode.LockMonitorNotEnoughBalanceForRelock);
      });

      await lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount);

      expect(renewLockSpy).toHaveBeenCalledBefore(releaseLockSpy);
      expect(releaseLockSpy).toHaveBeenCalled();
    });

    it('should just bubble up any unhandled errors.', async () => {
      const mockUnlockTxnTime = 4500;
      const currentValueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 5000,
        identifier: 'some identifier',
        owner: 'owner',
        unlockTransactionTime: mockUnlockTxnTime
      };

      const mockLastSavedDesiredLockAmount = 500;
      const lastSavedLockInfoInput: LockTransactionModel = {
        createTimestamp: 21323,
        desiredLockAmountInSatoshis: mockLastSavedDesiredLockAmount,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script',
        transactionId: 'transaction id',
        type: LockTransactionType.Create
      };

      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockUnlockTxnTime));

      const releaseLockSpy = spyOn(lockMonitor as any, 'releaseLockAndSaveItToDb');

      const mockUnhandledError = new BitcoinError('some unhandled error');
      const renewLockSpy = spyOn(lockMonitor as any, 'renewExistingLockAndSaveItToDb');
      renewLockSpy.and.callFake(() => {
        throw mockUnhandledError;
      });

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockMonitor['handleExistingLockRenewal'](currentValueTimeLockInput, lastSavedLockInfoInput, mockLastSavedDesiredLockAmount),
        mockUnhandledError.code
      );

      expect(renewLockSpy).toHaveBeenCalled();
      expect(releaseLockSpy).not.toHaveBeenCalled();
    });
  });

  describe('renewExistingLockAndSaveItToDb', () => {
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

      const mockLockInfo: LockTransactionModel = {
        desiredLockAmountInSatoshis: 2345,
        createTimestamp: 12323425,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.ReturnToWallet
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveAndThenBroadcastTransaction').and.returnValue(mockLockInfo);

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        unlockTransactionTime: 1234,
        owner: 'some - owner'
      };

      // Ensure that the desired lock amount is not too much.
      const desiredLockAmountInput = currentLockInfoInput.amountLocked - mockRenewLockTxn.transactionFee;
      const actual = await lockMonitor['renewExistingLockAndSaveItToDb'](currentLockInfoInput, desiredLockAmountInput);

      expect(actual).toEqual(mockLockInfo);

      const expectedNewLockBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createRelockTxnSpy).toHaveBeenCalledWith(mockCurrentLockId.transactionId, currentLockInfoInput.unlockTransactionTime, expectedNewLockBlock);
      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockRenewLockTxn, LockTransactionType.Relock, desiredLockAmountInput);
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
      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveAndThenBroadcastTransaction');

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        owner: 'wallet address',
        unlockTransactionTime: 1234
      };

      // Ensure that the desired lock amount is more to cause the error
      const desiredLockAmountInput = currentLockInfoInput.amountLocked + mockRenewLockTxn.transactionFee;

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockMonitor['renewExistingLockAndSaveItToDb'](currentLockInfoInput, desiredLockAmountInput),
        ErrorCode.LockMonitorNotEnoughBalanceForRelock);

      expect(saveBroadcastSpy).not.toHaveBeenCalled();
    });
  });

  describe('releaseLockAndSaveItToDb', () => {
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

      const mockLockInfo: LockTransactionModel = {
        desiredLockAmountInSatoshis: 2345,
        createTimestamp: 12323425,
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: LockTransactionType.ReturnToWallet
      };

      const saveBroadcastSpy = spyOn(lockMonitor as any, 'saveAndThenBroadcastTransaction').and.returnValue(mockLockInfo);

      const currentLockInfoInput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'abc',
        owner: 'wallet address',
        unlockTransactionTime: 1234
      };

      const desiredLockAmountInput = 2500;
      const actual = await lockMonitor['releaseLockAndSaveItToDb'](currentLockInfoInput, desiredLockAmountInput);
      expect(actual).toEqual(mockLockInfo);
      expect(saveBroadcastSpy).toHaveBeenCalledWith(mockReleaseLockTxn, LockTransactionType.ReturnToWallet, desiredLockAmountInput);
    });
  });

  describe('saveAndThenBroadcastTransaction', () => {
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
      const lockTxnTypeInput = LockTransactionType.Relock;

      const actual = await lockMonitor['saveAndThenBroadcastTransaction'](mockBitcoinLockTxn, lockTxnTypeInput, desiredLockAmtInput);

      const expectedLockSaved: LockTransactionModel = {
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
});
