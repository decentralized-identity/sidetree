import BitcoinClient from '../BitcoinClient';
import BitcoinError from '../BitcoinError';
import BitcoinLockTransactionModel from '../models/BitcoinLockTransactionModel';
import ErrorCode from '../ErrorCode';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import LockResolver from './LockResolver';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import SavedLockModel from '../models/SavedLockedModel';
import SavedLockType from '../enums/SavedLockType';
import ValueTimeLockModel from './../../common/models/ValueTimeLockModel';

/** Enum (internal to this class) to track the status of the lock. */
enum LockStatus {
  Confirmed = 'confirmed',
  None = 'none',
  Pending = 'pending'
}

/**
 * Structure (internal to this class) to track the state of the lock.
 */
interface LockState {
  currentValueTimeLock: ValueTimeLockModel | undefined;
  latestSavedLockInfo: SavedLockModel | undefined;

  status: LockStatus;
}

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private periodicPollTimeoutId: NodeJS.Timeout | undefined;

  private currentLockState: LockState;

  private lockResolver: LockResolver;

  constructor (
    private bitcoinClient: BitcoinClient,
    private lockTransactionStore: MongoDbLockTransactionStore,
    private pollPeriodInSeconds: number,
    private desiredLockAmountInSatoshis: number,
    private transactionFeesAmountInSatoshis: number,
    private lockPeriodInBlocks: number) {

    if (!Number.isInteger(desiredLockAmountInSatoshis)) {
      throw new BitcoinError(ErrorCode.LockMonitorDesiredLockAmountIsNotWholeNumber, `${desiredLockAmountInSatoshis}`);
    }

    if (!Number.isInteger(transactionFeesAmountInSatoshis)) {
      throw new BitcoinError(ErrorCode.LockMonitorTransactionFeesAmountIsNotWholeNumber, `${transactionFeesAmountInSatoshis}`);
    }

    this.lockResolver = new LockResolver(this.bitcoinClient);
    this.currentLockState = {
      currentValueTimeLock: undefined,
      latestSavedLockInfo: undefined,
      status: LockStatus.None
    };

    this.pollPeriodInSeconds = 60;
    this.lockPeriodInBlocks = 5;
    this.desiredLockAmountInSatoshis = 1000;
    this.transactionFeesAmountInSatoshis = 2000;
  }

  /**
   * Initializes this object by performing the periodic poll tasks.
   */
  public async initialize (): Promise<void> {
    this.currentLockState = await this.getCurrentLockState();

    await this.periodicPoll();
  }

  /**
   * Gets the current lock information if exist; undefined otherwise. Throws an error
   * if the lock information is not confirmed on the blockchain.
   */
  public getCurrentValueTimeLock (): ValueTimeLockModel | undefined {

    // Make a copy of the state so in case it gets changed between now and the function return
    const currentLockState = Object.assign({}, this.currentLockState);

    // If there's no lock then return undefined
    if (currentLockState.status === LockStatus.None) {
      return undefined;
    }

    if (currentLockState.status === LockStatus.Pending) {
      // Throw a very specific error so that the caller can do something
      // about it if they have to
      throw new BitcoinError(ErrorCode.LockMonitorCurrentValueTimeLockInPendingState);
    }

    return currentLockState.currentValueTimeLock;
  }

  private async periodicPoll (): Promise<void> {
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
      this.periodicPollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * this.pollPeriodInSeconds);
    }
  }

  private async handlePeriodicPolling (): Promise<void> {

    // If the current lock is in pending state then we cannot do anything and need to just return.
    if (this.currentLockState.status === LockStatus.Pending) {
      console.info(`The current lock status is in pending state; going to skip rest of the routine.`);

      // But refresh the lock state before returning so that the next polling has the new value.
      this.currentLockState = await this.getCurrentLockState();
      return;
    }

    // Now that we are not pending, check what do we have to do about the lock next.
    const validCurrentLockExist = this.currentLockState.status === LockStatus.Confirmed;
    const lockRequired = this.desiredLockAmountInSatoshis > 0;

    let currentLockUpdated = false;

    if (lockRequired && !validCurrentLockExist) {
      await this.handleCreatingNewLock(this.desiredLockAmountInSatoshis);
      currentLockUpdated = true;
    }

    if (lockRequired && validCurrentLockExist) {
      // The routine will true only if there were any changes made to the lock
      currentLockUpdated =
        await this.handleExistingLockRenewal(
          this.currentLockState.currentValueTimeLock!,
          this.currentLockState.latestSavedLockInfo!,
          this.desiredLockAmountInSatoshis);
    }

    if (!lockRequired && validCurrentLockExist) {
      await this.releaseLock(this.currentLockState.currentValueTimeLock!, this.desiredLockAmountInSatoshis);
      currentLockUpdated = true;
    }

    if (currentLockUpdated) {
      this.currentLockState = await this.getCurrentLockState();
    }
  }

  private async getCurrentLockState (): Promise<LockState> {

    const lastSavedLock = await this.lockTransactionStore.getLastLock();

    // Nothing to do if there's nothing found.
    if (!lastSavedLock) {
      return {
        currentValueTimeLock: undefined,
        latestSavedLockInfo: undefined,
        status: LockStatus.None
      };
    }

    console.info(`Found last saved lock of type: ${lastSavedLock.type} with transaction id: ${lastSavedLock.transactionId}.`);

    // Make sure that the last lock txn is actually written to the blockchain. Rebroadcast
    // if it is not as we don't want to do anything until last lock information is fully
    // confirmed to be on the blockchain.
    if (!(await this.isTransactionWrittenOnBitcoin(lastSavedLock.transactionId))) {

      await this.rebroadcastTransaction(lastSavedLock);

      return {
        currentValueTimeLock: undefined,
        latestSavedLockInfo: lastSavedLock,
        status: LockStatus.Pending
      };
    }

    if (lastSavedLock.type === SavedLockType.ReturnToWallet) {
      // This means that there's no current lock for this node. Just return
      return {
        currentValueTimeLock: undefined,
        latestSavedLockInfo: lastSavedLock,
        status: LockStatus.None
      };
    }

    // If we're here then it means that we have saved some information about a lock
    // which is confirmed to be on the blockchain. Let's resolve it to make sure that
    // we have all the information.
    const lastLockIdentifier: LockIdentifier = {
      transactionId: lastSavedLock.transactionId,
      redeemScriptAsHex: lastSavedLock.redeemScriptAsHex
    };

    const currentValueTimeLock = await this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);

    console.info(`Found a valid current lock: ${JSON.stringify(currentValueTimeLock)}`);

    return {
      currentValueTimeLock: currentValueTimeLock,
      latestSavedLockInfo: lastSavedLock,
      status: LockStatus.Confirmed
    };
  }

  private async rebroadcastTransaction (lastSavedLock: SavedLockModel): Promise<void> {
    console.info(`Rebroadcasting the transaction id: ${lastSavedLock.transactionId}`);

    // So we had some transaction information saved but the transaction was never found on the
    // blockchain. Either the transaction was broadcasted and we're just waiting for it to be
    // actually written or maybe this node died before it could actually broadcast the transaction.
    // Since we don't know which case it is and bitcoin will prevent 'double-spending' the same
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
      const transaction = await this.bitcoinClient.getRawTransaction(transactionId);

      return transaction.numberOfConfirmations > 0;
    } catch (e) {
      console.warn(`Transaction with id: ${transactionId} was not found on the bitcoin. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    return false;
  }

  private async handleCreatingNewLock (desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {

    // When creating the first lock, we are going to lock an amount more than the desired-amount
    // to account for the fee(s) required when relocking etc. So check whether the target
    // wallet has enough balance.
    const totalLockAmount = desiredLockAmountInSatoshis + this.transactionFeesAmountInSatoshis;
    const walletBalance = await this.bitcoinClient.getBalanceInSatoshis();

    if (walletBalance <= totalLockAmount) {
      throw new BitcoinError(ErrorCode.LockMonitorNotEnoughBalanceForFirstLock,
                             `Lock amount: ${totalLockAmount}; Wallet balance: ${walletBalance}`);
    }

    console.info(`Going to create a new lock for amount: ${totalLockAmount} satoshis. Current wallet balance: ${walletBalance}`);

    const lockUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + this.lockPeriodInBlocks;
    const lockTransaction = await this.bitcoinClient.createLockTransaction(totalLockAmount, lockUntilBlock);

    return this.saveThenBroadcastTransaction(lockTransaction, SavedLockType.Create, desiredLockAmountInSatoshis);
  }

  /**
   * Performs the lock renewal routine; returns true if any updates were made to the lock, false otherwise.
   *
   * @param currentValueTimeLock The current value time lock if any.
   * @param latestSavedLockInfo The last saved locked info.
   * @param desiredLockAmountInSatoshis The desired lock amount.
   */
  private async handleExistingLockRenewal (
    currentValueTimeLock: ValueTimeLockModel,
    latestSavedLockInfo: SavedLockModel,
    desiredLockAmountInSatoshis: number): Promise<boolean> {

    const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();

    console.info(`Current block: ${currentBlockTime}; Current lock's unlock block: ${currentValueTimeLock.unlockTransactionTime}`);

    // Just return if we're not close to expiry
    if (currentValueTimeLock.unlockTransactionTime - currentBlockTime > 1) {
      return false;
    }

    // If the desired lock amount is different from prevoius then just return the amount to
    // the wallet and let the next poll iteration start a new lock.
    if (latestSavedLockInfo.desiredLockAmountInSatoshis !== desiredLockAmountInSatoshis) {
      // tslint:disable-next-line: max-line-length
      console.info(`Current desired lock amount ${desiredLockAmountInSatoshis} satoshis is different from the previous desired lock amount ${latestSavedLockInfo.desiredLockAmountInSatoshis} satoshis. Going to releast the lock.`);

      await this.releaseLock(currentValueTimeLock, desiredLockAmountInSatoshis);
      return true;
    }

    // If we have gotten to here then we need to try renew.
    try {

      await this.renewLock(currentValueTimeLock, desiredLockAmountInSatoshis);
    } catch (e) {

      // If there is not enough balance for the relock then just release the lock. Let the next
      // iteration of the polling to try and create a new lock.
      if (e instanceof BitcoinError && e.code === ErrorCode.LockMonitorNotEnoughBalanceForRelock) {
        console.warn(`There is not enough balance for relocking so going to release the lock. Error: ${e.message}`);
        await this.releaseLock(currentValueTimeLock, desiredLockAmountInSatoshis);
      } else {
        // This is an unexpected error at this point ... rethrow as this is needed to be investigated.
        throw (e);
      }
    }

    return true;
  }

  private async renewLock (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {

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

    return this.saveThenBroadcastTransaction(relockTransaction, SavedLockType.Relock, desiredLockAmountInSatoshis);
  }

  private async releaseLock (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {
    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentValueTimeLock.identifier);

    const releaseLockTransaction =
      await this.bitcoinClient.createReleaseLockTransaction(
        currentLockIdentifier.transactionId,
        currentValueTimeLock.unlockTransactionTime);

    return this.saveThenBroadcastTransaction(releaseLockTransaction, SavedLockType.ReturnToWallet, desiredLockAmountInSatoshis);
  }

  private async saveThenBroadcastTransaction (
    lockTransaction: BitcoinLockTransactionModel,
    lockType: SavedLockType,
    desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {

    const lockInfoToSave: SavedLockModel = {
      desiredLockAmountInSatoshis: desiredLockAmountInSatoshis,
      rawTransaction: lockTransaction.serializedTransactionObject,
      transactionId: lockTransaction.transactionId,
      redeemScriptAsHex: lockTransaction.redeemScriptAsHex,
      createTimestamp: Date.now(),
      type: lockType
    };

    console.info(`Saving the ${lockType} type lock with transaction id: ${lockTransaction.transactionId}.`);

    // Make sure that we save the lock info to the db BEFORE trying to broadcast it. The reason being is
    // that if the service crashes right after saving then we can just rebroadcast. But if we broadcast first
    // and the service crashes then we won't have anything saved and will try to create yet another txn.
    await this.lockTransactionStore.addLock(lockInfoToSave);

    console.info(`Broadcasting the transaction id: ${lockTransaction.transactionId}`);
    await this.bitcoinClient.broadcastLockTransaction(lockTransaction);

    return lockInfoToSave;
  }
}
