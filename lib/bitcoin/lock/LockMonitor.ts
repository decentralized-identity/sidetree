import BitcoinClient from '../BitcoinClient';
import BitcoinError from '../BitcoinError';
import BitcoinLockTransactionModel from '../models/BitcoinLockTransactionModel';
import BlockchainLockModel from '../../common/models/BlockchainLockModel';
import ErrorCode from '../ErrorCode';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import LockResolver from './LockResolver';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import SavedLockTransactionModel from '../models/SavedLockTransactionModel';
import SavedLockTransactionType from '../enums/SavedLockTransactionType';

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private pollTimeoutId: number | undefined;

  private lastValidBlockchainLock: BlockchainLockModel | undefined;

  private lockResolver: LockResolver;

  constructor (
    private bitcoinClient: BitcoinClient,
    private lockTransactionStore: MongoDbLockTransactionStore,
    private pollPeriodInSeconds: number,
    private desiredLockAmountInSatoshis: number,
    private lockPeriodInBlocks: number,
    private firstLockFeeAmountInSatoshis: number) {

    this.lockResolver = new LockResolver(this.bitcoinClient);
  }

  /**
   * Initializes this object by either creating a lock/relock or returning the amount
   * back to the target bitcoin wallet if needed.
   */
  public async initialize (): Promise<void> {
    await this.periodicPoll();
  }

  private async periodicPoll (intervalInSeconds: number = this.pollPeriodInSeconds) {

    try {
      // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
      if (this.pollTimeoutId) {
        clearTimeout(this.pollTimeoutId);
      }

      this.lastValidBlockchainLock = await this.getLastValidLockCreatedByThisNode();

      const lastLockExist = this.lastValidBlockchainLock !== undefined;
      const lockRequired = this.desiredLockAmountInSatoshis > 0;

      if (lockRequired && !lastLockExist) {
        await this.handleCreatingNewLock(this.desiredLockAmountInSatoshis);
      }

      if (lockRequired && lastLockExist) {
        await this.handleExistingLockRenewal(this.lastValidBlockchainLock!, this.desiredLockAmountInSatoshis);
      }

      if (!lockRequired && lastLockExist) {
        await this.releaseLockAndSaveItToDb(this.lastValidBlockchainLock!);
      }

      this.lastValidBlockchainLock = await this.getLastValidLockCreatedByThisNode();
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * intervalInSeconds);
    }
  }

  private async getLastValidLockCreatedByThisNode (): Promise<BlockchainLockModel | undefined> {
    const lastSavedLock = await this.lockTransactionStore.getLastLock();

    if (!lastSavedLock) {
      return undefined;
    }

    if (lastSavedLock.type === SavedLockTransactionType.ReturnToWallet) {
      // Check if the transaction is actually written on blockchain
      if (!(await this.isTransactionWrittenOnBitcoin(lastSavedLock.transactionId))) {
        await this.handleLastLockTransactionNotFoundError(lastSavedLock);
      }

      return undefined;
    }

    try {
      const lastLockIdentifier: LockIdentifier = {
        transactionId: lastSavedLock.transactionId,
        redeemScriptAsHex: lastSavedLock.redeemScriptAsHex,
        walletAddressAsBuffer: this.bitcoinClient.getWalletAddressAsBuffer()
      };

      return this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);
    } catch (e) {

      // If the transaction was not found on the bitcoin
      if (e instanceof BitcoinError && e.code === ErrorCode.LockResolverTransactionNotFound) {
        await this.handleLastLockTransactionNotFoundError(lastSavedLock);

      } else {
        // This is an unhandle-able error and we need to just rethrow ... the following will
        // mantain the original stacktrace
        throw (e);
      }
    }

    return undefined;
  }

  private async handleLastLockTransactionNotFoundError (lastSavedLock: SavedLockTransactionModel): Promise<void> {
    // So we had some transaction information saved but the transaction was never found on the
    // blockchain. Either the transaction was broadcasted and we're just waiting for it to be
    // actually written or maybe this node died before it could actually broadcast the transaction.
    // Since we don't which case it is and bitcoin will prevent 'double-spending' the same
    // transaction, we can just rebroadcast the same transaction.
    const lockTransactionFromLastSavedLock: BitcoinLockTransactionModel = {
      redeemScriptAsHex: lastSavedLock.redeemScriptAsHex,
      serializedTransactionObject: lastSavedLock.rawTransaction,
      transactionId: lastSavedLock.transactionId,

      // Setting a 'fake' fee because the model requires it but broadcasting does not really
      // require it so this is not going to have any effect when trying to broadcast.
      transactionFee: 0
    };

    await this.bitcoinClient.broadcastLockTransaction(lockTransactionFromLastSavedLock);
  }

  private async isTransactionWrittenOnBitcoin (transactionId: string): Promise<boolean> {
    try {
      await this.bitcoinClient.getRawTransaction(transactionId);

      // no exception thrown == transaction found.
      return true;
    } catch (e) {
      console.info(`Transaction with id: ${transactionId} was not found on the bitcoin. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    return false;
  }

  private async handleCreatingNewLock (desiredLockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {

    // When creating the first lock, we are going to lock an amount more than the amount
    // to account for the fee(s) required when relocking etc. So check whether the target
    // wallet has enough balance.
    const totalLockAmount = desiredLockAmountInSatoshis + this.firstLockFeeAmountInSatoshis;
    const walletBalance = await this.bitcoinClient.getBalanceInSatoshis();

    if (walletBalance <= totalLockAmount) {
      throw new BitcoinError(ErrorCode.LockMonitorNotEnoughBalanceForFirstLock,
                             `Lock amount: ${totalLockAmount}; Wallet balance: ${walletBalance}`);
    }

    return this.createNewLockAndSaveItToDb(totalLockAmount);
  }

  private async handleExistingLockRenewal (currentLockInfo: BlockchainLockModel, desiredLockAmountInSatoshis: number): Promise<void> {

    // If desired amount is < amount already locked ??

    const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();

    // Just return if we're not close to expiry
    if (currentLockInfo.lockEndTransactionTime - currentBlockTime > 1) {
      return;
    }

    try {
      // Try to renew
      await this.renewExistingLockAndSaveItToDb(currentLockInfo, desiredLockAmountInSatoshis);
    } catch (e) {

      // If there is not enough balance for the relock then return the money back.
      if (e instanceof BitcoinError && e.code === ErrorCode.LockMonitorNotEnoughBalanceForRelock) {
        await this.releaseLockAndSaveItToDb(currentLockInfo);
      } else {
        // This is an unexpected error at this point ... rethrow as this is needed to be investigated.
        throw (e);
      }
    }
  }

  private async createNewLockAndSaveItToDb (desiredLockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {

    const lockUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + this.lockPeriodInBlocks;
    const lockTransaction = await this.bitcoinClient.createLockTransaction(desiredLockAmountInSatoshis, lockUntilBlock);

    const lockInfoToSave: SavedLockTransactionModel = {
      rawTransaction: lockTransaction.serializedTransactionObject,
      transactionId: lockTransaction.transactionId,
      redeemScriptAsHex: lockTransaction.redeemScriptAsHex,
      createTimestamp: Date.now(),
      type: SavedLockTransactionType.Create
    };

    await this.lockTransactionStore.addLock(lockInfoToSave);

    await this.bitcoinClient.broadcastLockTransaction(lockTransaction);

    return lockInfoToSave;
  }

  private async renewExistingLockAndSaveItToDb (currentLockInfo: BlockchainLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {

    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentLockInfo.identifier);
    const lockUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + this.lockPeriodInBlocks;

    const relockTransaction =
      await this.bitcoinClient.createRelockTransaction(
          currentLockIdentifier.transactionId,
          currentLockInfo.lockEndTransactionTime,
          lockUntilBlock);

    // If the transaction fee is making the relock amount less than the desired amount
    if (currentLockInfo.amountLocked - relockTransaction.transactionFee < desiredLockAmountInSatoshis) {
      throw new BitcoinError(
        ErrorCode.LockMonitorNotEnoughBalanceForRelock,
        // tslint:disable-next-line: max-line-length
        `The relocking fee (${relockTransaction.transactionFee} satoshis) is causing the relock amount to go below the desired lock amount: ${desiredLockAmountInSatoshis}`);
    }

    const lockInfoToSave: SavedLockTransactionModel = {
      rawTransaction: relockTransaction.serializedTransactionObject,
      transactionId: relockTransaction.transactionId,
      redeemScriptAsHex: relockTransaction.redeemScriptAsHex,
      createTimestamp: Date.now(),
      type: SavedLockTransactionType.Relock
    };

    await this.lockTransactionStore.addLock(lockInfoToSave);

    await this.bitcoinClient.broadcastLockTransaction(relockTransaction);

    return lockInfoToSave;
  }

  private async releaseLockAndSaveItToDb (currentLockInfo: BlockchainLockModel): Promise<SavedLockTransactionModel> {
    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentLockInfo.identifier);

    const releaseLockTransaction =
      await this.bitcoinClient.createReleaseLockTransaction(
        currentLockIdentifier.transactionId,
        currentLockInfo.lockEndTransactionTime);

    const lockInfoToSave: SavedLockTransactionModel = {
      rawTransaction: releaseLockTransaction.serializedTransactionObject,
      transactionId: releaseLockTransaction.transactionId,
      redeemScriptAsHex: releaseLockTransaction.redeemScriptAsHex,
      createTimestamp: Date.now(),
      type: SavedLockTransactionType.ReturnToWallet
    };

    await this.lockTransactionStore.addLock(lockInfoToSave);

    await this.bitcoinClient.broadcastLockTransaction(releaseLockTransaction);

    return lockInfoToSave;
  }
}
