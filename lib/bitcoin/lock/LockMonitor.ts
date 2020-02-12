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
 * Structure (internal to this class) to track the information about lock.
 */
interface LockInformation {
  currentValidBlockchainLock: BlockchainLockModel | undefined;
  currentLockInfoSavedInDb: SavedLockTransactionModel | undefined;

  // Need to add a 'state'
}

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private pollTimeoutId: number | undefined;

  private currentLockInformation: LockInformation | undefined;

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

      this.currentLockInformation = await this.resolveCurrentLockInformation();

      // ALSO need to check the state (pending/confirmed etc) below
      const validCurrentLockExist = this.currentLockInformation.currentLockInfoSavedInDb !== undefined &&
                                    this.currentLockInformation.currentValidBlockchainLock !== undefined;

      const lockRequired = this.desiredLockAmountInSatoshis > 0;

      if (lockRequired && !validCurrentLockExist) {
        await this.handleCreatingNewLock(this.desiredLockAmountInSatoshis);
      }

      if (lockRequired && validCurrentLockExist) {
        await this.handleExistingLockRenewal(
          this.currentLockInformation.currentValidBlockchainLock!,
          this.currentLockInformation.currentLockInfoSavedInDb!,
          this.desiredLockAmountInSatoshis);
      }

      if (!lockRequired && validCurrentLockExist) {
        await this.releaseLockAndSaveItToDb(this.currentLockInformation.currentValidBlockchainLock!, this.desiredLockAmountInSatoshis);
      }

      this.currentLockInformation = await this.resolveCurrentLockInformation();
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * intervalInSeconds);
    }
  }

  private async resolveCurrentLockInformation (): Promise<LockInformation> {

    const currentLockInformation: LockInformation = {
      currentValidBlockchainLock: undefined,
      currentLockInfoSavedInDb: undefined
    };

    const lastSavedLock = await this.lockTransactionStore.getLastLock();

    if (!lastSavedLock) {
      return currentLockInformation;
    }

    if (lastSavedLock.type === SavedLockTransactionType.ReturnToWallet) {
      // Check if the transaction is actually written on blockchain
      if (!(await this.isTransactionWrittenOnBitcoin(lastSavedLock.transactionId))) {
        await this.handleLastLockTransactionNotFoundError(lastSavedLock);
      }

      return currentLockInformation;
    }

    // If we're here then it means that we have saved some information about a lock (which we
    // still need to resolve)
    currentLockInformation.currentLockInfoSavedInDb = lastSavedLock;

    try {
      const lastLockIdentifier: LockIdentifier = {
        transactionId: lastSavedLock.transactionId,
        redeemScriptAsHex: lastSavedLock.redeemScriptAsHex,
        walletAddressAsBuffer: this.bitcoinClient.getWalletAddressAsBuffer()
      };

      currentLockInformation.currentValidBlockchainLock = await this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);

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

    return currentLockInformation;
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

  private async handleExistingLockRenewal (
    currentLockInfo: BlockchainLockModel,
    currentSavedLockInfo: SavedLockTransactionModel,
    desiredLockAmountInSatoshis: number): Promise<void> {

    // If desired amount is < amount already locked ??

    const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();

    // Just return if we're not close to expiry
    if (currentLockInfo.lockEndTransactionTime - currentBlockTime > 1) {
      return;
    }

    // If the desired lock amount is different from prevoius then just return the amount to
    // the wallet and let the next poll iteration start a new lock.
    if (currentSavedLockInfo.desiredLockAmountInSatoshis !== desiredLockAmountInSatoshis) {
      await this.releaseLockAndSaveItToDb(currentLockInfo, desiredLockAmountInSatoshis);
      return;
    }

    // If we have gotten to here then we need to try renew.
    try {

      await this.renewExistingLockAndSaveItToDb(currentLockInfo, desiredLockAmountInSatoshis);
    } catch (e) {

      // If there is not enough balance for the relock then just release the lock. Let the next
      // iteration of the polling to try and create a new lock.
      if (e instanceof BitcoinError && e.code === ErrorCode.LockMonitorNotEnoughBalanceForRelock) {
        await this.releaseLockAndSaveItToDb(currentLockInfo, desiredLockAmountInSatoshis);
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
      desiredLockAmountInSatoshis: desiredLockAmountInSatoshis,
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
      desiredLockAmountInSatoshis: desiredLockAmountInSatoshis,
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

  private async releaseLockAndSaveItToDb (currentLockInfo: BlockchainLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {
    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentLockInfo.identifier);

    const releaseLockTransaction =
      await this.bitcoinClient.createReleaseLockTransaction(
        currentLockIdentifier.transactionId,
        currentLockInfo.lockEndTransactionTime);

    const lockInfoToSave: SavedLockTransactionModel = {
      desiredLockAmountInSatoshis: desiredLockAmountInSatoshis,
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
