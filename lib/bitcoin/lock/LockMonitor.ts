import BitcoinClient from '../BitcoinClient';
import BitcoinError from '../BitcoinError';
import BitcoinLockTransactionModel from '../models/BitcoinLockTransactionModel';
import ErrorCode from '../ErrorCode';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import LockResolver from './LockResolver';
import LockTransactionModel from './../models/LockTransactionModel';
import LockTransactionType from './../enums/LockTransactionType';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import ValueTimeLockConfigProvider from '../../common/ValueTimeLockConfigProvider';
import ValueTimeLockModel from './../../common/models/ValueTimeLockModel';

/** Enum (internal to this class) to track the state of the lock. */
enum LockState {
  Confirmed = 'confirmed',
  None = 'none',
  Pending = 'pending'
}

/**
 * Structure (internal to this class) to track the information about lock.
 */
interface LockInformation {
  currentValueTimeLock: ValueTimeLockModel | undefined;
  latestSavedLockInfo: LockTransactionModel | undefined;

  state: LockState;
}

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private periodicPollTimeoutId: number | undefined;
  private desiredLockAmountInSatoshis: number;
  private lockPeriodInBlocks: number;

  private currentLockInformation: LockInformation | undefined;

  private lockResolver: LockResolver;

  constructor (
    private bitcoinClient: BitcoinClient,
    private lockTransactionStore: MongoDbLockTransactionStore,
    private pollPeriodInSeconds: number,
    private firstLockFeeAmountInSatoshis: number,
    maxNumOfOperationsForValueTimeLock: number) {

    this.desiredLockAmountInSatoshis = ValueTimeLockConfigProvider.getRequiredLockAmountForOps(maxNumOfOperationsForValueTimeLock);
    this.lockPeriodInBlocks = ValueTimeLockConfigProvider.getRequiredLockTransactionTimeForOps(maxNumOfOperationsForValueTimeLock);

    this.lockResolver = new LockResolver(this.bitcoinClient);
  }

  /**
   * Initializes this object by performing the periodic poll tasks.
   */
  public async initialize (): Promise<void> {
    await this.periodicPoll();
  }

  /**
   * Gets the current lock information if exist; undefined otherwise. Throws an error
   * if the lock information is not confirmed on the blockchain.
   */
  public getCurrentValueTimeLock (): ValueTimeLockModel | undefined {
    if (this.currentLockInformation!.state === LockState.Pending) {
      // Throw a very specific error so that the caller can do something
      // about it if they have to
      throw new BitcoinError(ErrorCode.LockMonitorCurrentValueTimeLockInPendingState);
    }

    // Make a copy of the state and return it
    return Object.assign({}, this.currentLockInformation!.currentValueTimeLock);
  }

  private async periodicPoll (intervalInSeconds: number = this.pollPeriodInSeconds): Promise<void> {

    try {
      // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
      if (this.periodicPollTimeoutId) {
        clearTimeout(this.periodicPollTimeoutId);
      }

      console.info(`Starting periodic polling for the lock monitor.`);
      await this.handlePeriodicPolling();

    } catch (e) {
      const message = `An error occured during periodic poll: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`;
      console.error(message);
    } finally {
      this.periodicPollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * intervalInSeconds, intervalInSeconds);
    }
  }

  private async handlePeriodicPolling (): Promise<void> {

    this.currentLockInformation = await this.resolveCurrentValueTimeLock();

    const validCurrentLockExist = this.currentLockInformation.currentValueTimeLock !== undefined;
    const lockRequired = this.desiredLockAmountInSatoshis > 0;

    let resolveCurrentLockAgain = false;

    if (lockRequired && !validCurrentLockExist) {
      await this.handleCreatingNewLock(this.desiredLockAmountInSatoshis);
      resolveCurrentLockAgain = true;
    }

    if (lockRequired && validCurrentLockExist) {
      await this.handleExistingLockRenewal(
        this.currentLockInformation.currentValueTimeLock!,
        this.currentLockInformation.latestSavedLockInfo!,
        this.desiredLockAmountInSatoshis);

      resolveCurrentLockAgain = true;
    }

    if (!lockRequired && validCurrentLockExist) {
      await this.releaseLockAndSaveItToDb(this.currentLockInformation.currentValueTimeLock!, this.desiredLockAmountInSatoshis);

      resolveCurrentLockAgain = true;
    }

    if (resolveCurrentLockAgain) {
      this.currentLockInformation = await this.resolveCurrentValueTimeLock();
    }
  }

  private async resolveCurrentValueTimeLock (): Promise<LockInformation> {

    const currentLockInformation: LockInformation = {
      currentValueTimeLock: undefined,
      latestSavedLockInfo: undefined,
      state: LockState.None
    };

    const lastSavedLock = await this.lockTransactionStore.getLastLock();
    currentLockInformation.latestSavedLockInfo = lastSavedLock;

    // Nothing to do if there's nothing found.
    if (!lastSavedLock) {
      return currentLockInformation;
    }

    console.info(`Found last saved lock of type: ${lastSavedLock.type} with transaction id: ${lastSavedLock.transactionId}.`);

    // Make sure that the last lock txn is actually written to the blockchain. Rebroadcast
    // if it is not as we don't want to do anything until last lock information is fully
    // confirmed to be on the blockchain.
    if (!(await this.isTransactionWrittenOnBitcoin(lastSavedLock.transactionId))) {

      await this.rebroadcastTransaction(lastSavedLock);

      currentLockInformation.state = LockState.Pending;
      return currentLockInformation;
    }

    if (lastSavedLock.type === LockTransactionType.ReturnToWallet) {
      // This means that there's no current lock for this node. Just return
      return currentLockInformation;
    }

    // If we're here then it means that we have saved some information about a lock (which we
    // still need to resolve) which is confirmed to be on the blockchain.
    const lastLockIdentifier: LockIdentifier = {
      transactionId: lastSavedLock.transactionId,
      redeemScriptAsHex: lastSavedLock.redeemScriptAsHex
    };

    currentLockInformation.currentValueTimeLock = await this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);
    currentLockInformation.state = LockState.Confirmed;

    console.info(`Found a valid current lock: ${JSON.stringify(currentLockInformation.currentValueTimeLock)}`);

    return currentLockInformation;
  }

  private async rebroadcastTransaction (lastSavedLock: LockTransactionModel): Promise<void> {
    console.info(`Rebroadcasting the transaction id: ${lastSavedLock.transactionId}`);

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
      console.warn(`Transaction with id: ${transactionId} was not found on the bitcoin. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    return false;
  }

  private async handleCreatingNewLock (desiredLockAmountInSatoshis: number): Promise<LockTransactionModel> {

    // When creating the first lock, we are going to lock an amount more than the amount
    // to account for the fee(s) required when relocking etc. So check whether the target
    // wallet has enough balance.
    const totalLockAmount = desiredLockAmountInSatoshis + this.firstLockFeeAmountInSatoshis;
    const walletBalance = await this.bitcoinClient.getBalanceInSatoshis();

    if (walletBalance <= totalLockAmount) {
      throw new BitcoinError(ErrorCode.LockMonitorNotEnoughBalanceForFirstLock,
                             `Lock amount: ${totalLockAmount}; Wallet balance: ${walletBalance}`);
    }

    console.info(`Going to create a new lock for amount: ${totalLockAmount} satoshis. Current wallet balance: ${walletBalance}`);

    const lockUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + this.lockPeriodInBlocks;
    const lockTransaction = await this.bitcoinClient.createLockTransaction(totalLockAmount, lockUntilBlock);

    return this.saveAndThenBroadcastTransaction(lockTransaction, LockTransactionType.Create, desiredLockAmountInSatoshis);
  }

  private async handleExistingLockRenewal (
    currentValueTimeLock: ValueTimeLockModel,
    latestSavedLockInfo: LockTransactionModel,
    desiredLockAmountInSatoshis: number): Promise<void> {

    const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();

    console.info(`Current block: ${currentBlockTime}; Current lock's unlock block: ${currentValueTimeLock.unlockTransactionTime}`);

    // Just return if we're not close to expiry
    if (currentValueTimeLock.unlockTransactionTime - currentBlockTime > 1) {
      return;
    }

    // If the desired lock amount is different from prevoius then just return the amount to
    // the wallet and let the next poll iteration start a new lock.
    if (latestSavedLockInfo.desiredLockAmountInSatoshis !== desiredLockAmountInSatoshis) {
      // tslint:disable-next-line: max-line-length
      console.info(`Current desired lock amount ${desiredLockAmountInSatoshis} satoshis is different from the previous desired lock amount ${latestSavedLockInfo.desiredLockAmountInSatoshis} satoshis. Going to releast the lock.`);

      await this.releaseLockAndSaveItToDb(currentValueTimeLock, desiredLockAmountInSatoshis);
      return;
    }

    // If we have gotten to here then we need to try renew.
    try {

      await this.renewExistingLockAndSaveItToDb(currentValueTimeLock, desiredLockAmountInSatoshis);
    } catch (e) {

      // If there is not enough balance for the relock then just release the lock. Let the next
      // iteration of the polling to try and create a new lock.
      if (e instanceof BitcoinError && e.code === ErrorCode.LockMonitorNotEnoughBalanceForRelock) {
        console.warn(`There is not enough balance for relocking so going to release the lock. Error: ${e.message}`);
        await this.releaseLockAndSaveItToDb(currentValueTimeLock, desiredLockAmountInSatoshis);
      } else {
        // This is an unexpected error at this point ... rethrow as this is needed to be investigated.
        throw (e);
      }
    }
  }

  private async renewExistingLockAndSaveItToDb (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<LockTransactionModel> {

    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentValueTimeLock.identifier);
    const lockUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + this.lockPeriodInBlocks;

    const relockTransaction =
      await this.bitcoinClient.createRelockTransaction(
          currentLockIdentifier.transactionId,
          currentValueTimeLock.unlockTransactionTime,
          lockUntilBlock);

    // If the transaction fee is making the relock amount less than the desired amount
    if (currentValueTimeLock.amountLocked - relockTransaction.transactionFee < desiredLockAmountInSatoshis) {
      throw new BitcoinError(
        ErrorCode.LockMonitorNotEnoughBalanceForRelock,
        // tslint:disable-next-line: max-line-length
        `The current locked amount (${currentValueTimeLock.amountLocked} satoshis) minus the relocking fee (${relockTransaction.transactionFee} satoshis) is causing the relock amount to go below the desired lock amount: ${desiredLockAmountInSatoshis}`);
    }

    return this.saveAndThenBroadcastTransaction(relockTransaction, LockTransactionType.Relock, desiredLockAmountInSatoshis);
  }

  private async releaseLockAndSaveItToDb (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<LockTransactionModel> {
    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentValueTimeLock.identifier);

    const releaseLockTransaction =
      await this.bitcoinClient.createReleaseLockTransaction(
        currentLockIdentifier.transactionId,
        currentValueTimeLock.unlockTransactionTime);

    return this.saveAndThenBroadcastTransaction(releaseLockTransaction, LockTransactionType.ReturnToWallet, desiredLockAmountInSatoshis);
  }

  private async saveAndThenBroadcastTransaction (
    lockTransaction: BitcoinLockTransactionModel,
    lockTransactionType: LockTransactionType,
    desiredLockAmountInSatoshis: number): Promise<LockTransactionModel> {

    const lockInfoToSave: LockTransactionModel = {
      desiredLockAmountInSatoshis: desiredLockAmountInSatoshis,
      rawTransaction: lockTransaction.serializedTransactionObject,
      transactionId: lockTransaction.transactionId,
      redeemScriptAsHex: lockTransaction.redeemScriptAsHex,
      createTimestamp: Date.now(),
      type: lockTransactionType
    };

    console.info(`Saving the ${lockTransactionType} type lock with transaction id: ${lockTransaction.transactionId}.`);
    await this.lockTransactionStore.addLock(lockInfoToSave);

    console.info(`Broadcasting the transaction id: ${lockTransaction.transactionId}`);
    await this.bitcoinClient.broadcastLockTransaction(lockTransaction);

    return lockInfoToSave;
  }
}
