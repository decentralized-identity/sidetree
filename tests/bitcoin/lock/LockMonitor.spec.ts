import BitcoinLockTransactionModel from '../../../lib/bitcoin/models/BitcoinLockTransactionModel';
import BitcoinClient from '../../../lib/bitcoin/BitcoinClient';
import BlockchainLockModel from '../../../lib/common/models/BlockchainLockModel';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import LockMonitor from '../../../lib/bitcoin/lock/LockMonitor';
import MongoDbLockTransactionStore from '../../../lib/bitcoin/lock/MongoDbLockTransactionStore';
import SavedLockTransactionModel from '../../../lib/bitcoin/models/SavedLockTransactionModel';
import SavedLockTransactionType from '../../../lib/bitcoin/enums/SavedLockTransactionType';

fdescribe('LockMonitor', () => {

  const validTestWalletImportString = 'cTpKFwqu2HqW4y5ByMkNRKAvkPxEcwpax5Qr33ibYvkp1KSxdji6';

  let lockMonitor: LockMonitor;

  beforeEach(() => {
    const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1);
    const mongoDbLockStore = new MongoDbLockTransactionStore('server-url', 'db');
    lockMonitor = new LockMonitor(bitcoinClient, mongoDbLockStore, 60, 1000, 50, 1200);
  });

  describe('handleCreatingNewLock', () => {
    it('should create the first lock', async () => {
      // Make sure that there's enough wallet balance available
      const mockWalletBalance = 32430234 + lockMonitor['firstLockFeeAmountInSatoshis'] + 200;
      spyOn(lockMonitor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(mockWalletBalance));

      const mockLockInfoSaved: SavedLockTransactionModel = {
        createTimestamp: Date.now(),
        rawTransaction: 'raw transaction',
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        type: SavedLockTransactionType.Create
      };

      const createLockSpy = spyOn(lockMonitor as any,'createNewLockAndSaveItToDb').and.returnValue(Promise.resolve(mockLockInfoSaved));

      const desiredLockAmount = mockWalletBalance - (mockWalletBalance * 0.5);
      const actual = await lockMonitor['handleCreatingNewLock'](desiredLockAmount);
      expect(actual).toEqual(mockLockInfoSaved);
      expect(createLockSpy).toHaveBeenCalledWith(desiredLockAmount + lockMonitor['firstLockFeeAmountInSatoshis']);
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

  describe('createNewLockAndSaveItToDb', () => {
    it('should create a new lock and save the updated information to the db', async () => {

      const mockCurrentBlockHeight = 455678;
      spyOn(lockMonitor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(mockCurrentBlockHeight));

      const mockLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'renew lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };

      const createLockTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'createLockTransaction').and.returnValue(Promise.resolve(mockLockTxn));
      const lockStoreSpy = spyOn(lockMonitor['lockTransactionStore'], 'addLock').and.returnValue(Promise.resolve());
      const broadcastTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction').and.returnValue(Promise.resolve('id'));

      const mockDateValue = Date.now();
      spyOn(Date, 'now').and.returnValue(mockDateValue);

      const lockAmountInput = 987845;

      const actual = await lockMonitor['createNewLockAndSaveItToDb'](lockAmountInput);

      const expectedLockInfoSaved: SavedLockTransactionModel = {
        createTimestamp: mockDateValue,
        rawTransaction: mockLockTxn.serializedTransactionObject,
        redeemScriptAsHex: mockLockTxn.redeemScriptAsHex,
        transactionId: mockLockTxn.transactionId,
        type: SavedLockTransactionType.Create
      };
      expect(actual).toEqual(expectedLockInfoSaved);

      const expectedNewLockBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createLockTxnSpy).toHaveBeenCalledWith(lockAmountInput, expectedNewLockBlock);
      expect(lockStoreSpy).toHaveBeenCalledWith(expectedLockInfoSaved);
      expect(broadcastTxnSpy).not.toHaveBeenCalledBefore(lockStoreSpy);
    });
  });

  describe('renewExistingLockAndSaveItToDb', () => {
    it('should renew the existing lock and save the updated information to the db', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        walletAddressAsBuffer: Buffer.from('wallet address')
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
      const lockStoreSpy = spyOn(lockMonitor['lockTransactionStore'], 'addLock').and.returnValue(Promise.resolve());
      const broadcastTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction').and.returnValue(Promise.resolve('id'));

      const mockDateValue = Date.now();
      spyOn(Date, 'now').and.returnValue(mockDateValue);

      const currentLockInfoInput: BlockchainLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        linkedWalletAddress: 'wallet address',
        lockEndTransactionTime: 1234
      };

      // Ensure that the desired lock amount is not too much.
      const desiredLockAmountInput = currentLockInfoInput.amountLocked - mockRenewLockTxn.transactionFee;
      const actual = await lockMonitor['renewExistingLockAndSaveItToDb'](currentLockInfoInput, desiredLockAmountInput);

      const expectedLockInfoSaved: SavedLockTransactionModel = {
        createTimestamp: mockDateValue,
        rawTransaction: mockRenewLockTxn.serializedTransactionObject,
        redeemScriptAsHex: mockRenewLockTxn.redeemScriptAsHex,
        transactionId: mockRenewLockTxn.transactionId,
        type: SavedLockTransactionType.Relock
      };
      expect(actual).toEqual(expectedLockInfoSaved);

      const expectedNewLockBlock = mockCurrentBlockHeight + lockMonitor['lockPeriodInBlocks'];
      expect(createRelockTxnSpy).toHaveBeenCalledWith(mockCurrentLockId.transactionId, currentLockInfoInput.lockEndTransactionTime, expectedNewLockBlock);
      expect(lockStoreSpy).toHaveBeenCalledWith(expectedLockInfoSaved);
      expect(broadcastTxnSpy).not.toHaveBeenCalledBefore(lockStoreSpy);
    });

    it('should throw if the renew fees are causing the new lock amount to be less than the desired lock.', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        walletAddressAsBuffer: Buffer.from('wallet address')
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
      const lockStoreSpy = spyOn(lockMonitor['lockTransactionStore'], 'addLock');
      const broadcastTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction');

      const mockDateValue = Date.now();
      spyOn(Date, 'now').and.returnValue(mockDateValue);

      const currentLockInfoInput: BlockchainLockModel = {
        amountLocked: 1234,
        identifier: 'abc',
        linkedWalletAddress: 'wallet address',
        lockEndTransactionTime: 1234
      };

      // Ensure that the desired lock amount is more to cause the error
      const desiredLockAmountInput = currentLockInfoInput.amountLocked + mockRenewLockTxn.transactionFee;

      await JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrownAsync(
        () => lockMonitor['renewExistingLockAndSaveItToDb'](currentLockInfoInput, desiredLockAmountInput),
        ErrorCode.LockMonitorNotEnoughBalanceForRelock);

      expect(lockStoreSpy).not.toHaveBeenCalled();
      expect(broadcastTxnSpy).not.toHaveBeenCalled();
    });
  });

  describe('releaseLockAndSaveItToDb', () => {
    it('should release the lock and save the updated information to the db', async () => {
      const mockCurrentLockId: LockIdentifier = {
        redeemScriptAsHex: 'redeem script as hex',
        transactionId: 'transaction id',
        walletAddressAsBuffer: Buffer.from('wallet address')
      };

      spyOn(LockIdentifierSerializer, 'deserialize').and.returnValue(mockCurrentLockId);

      const mockReleaseLockTxn: BitcoinLockTransactionModel = {
        redeemScriptAsHex: 'release lock txn redeem script',
        serializedTransactionObject: 'serialized txn',
        transactionId: 'transaction id',
        transactionFee: 100
      };

      spyOn(lockMonitor['bitcoinClient'], 'createReleaseLockTransaction').and.returnValue(Promise.resolve(mockReleaseLockTxn));
      const lockStoreSpy = spyOn(lockMonitor['lockTransactionStore'], 'addLock').and.returnValue(Promise.resolve());
      const broadcastTxnSpy = spyOn(lockMonitor['bitcoinClient'], 'broadcastLockTransaction').and.returnValue(Promise.resolve('id'));

      const mockDateValue = Date.now();
      spyOn(Date, 'now').and.returnValue(mockDateValue);

      const currentLockInfoInput: BlockchainLockModel = {
        amountLocked: 123,
        identifier: 'abc',
        linkedWalletAddress: 'wallet address',
        lockEndTransactionTime: 1234
      };

      const actual = await lockMonitor['releaseLockAndSaveItToDb'](currentLockInfoInput);

      const expectedLockInfoSaved: SavedLockTransactionModel = {
        createTimestamp: mockDateValue,
        rawTransaction: mockReleaseLockTxn.serializedTransactionObject,
        redeemScriptAsHex: mockReleaseLockTxn.redeemScriptAsHex,
        transactionId: mockReleaseLockTxn.transactionId,
        type: SavedLockTransactionType.ReturnToWallet
      };
      expect(actual).toEqual(expectedLockInfoSaved);

      expect(lockStoreSpy).toHaveBeenCalledWith(expectedLockInfoSaved);
      expect(broadcastTxnSpy).not.toHaveBeenCalledBefore(lockStoreSpy);
    });
  });
});
