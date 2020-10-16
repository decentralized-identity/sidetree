import BitcoinClient from '../BitcoinClient';
import BitcoinLockTransactionModel from '../models/BitcoinLockTransactionModel';
import ErrorCode from '../ErrorCode';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import LockResolver from './LockResolver';
import LogColor from '../../common/LogColor';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import SavedLockModel from '../models/SavedLockedModel';
import SavedLockType from '../enums/SavedLockType';
import SidetreeError from '../../common/SidetreeError';
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
  activeValueTimeLock: ValueTimeLockModel | undefined;
  latestSavedLockInfo: SavedLockModel | undefined;

  status: LockStatus;
}

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {
  private periodicPollTimeoutId: NodeJS.Timeout | undefined;

  /**
   * Constructor for LockMonitor.
   * @param valueTimeLockUpdateEnabled When this parameter is set to `false`, parameters `lockPeriodInBlocks`,
   *                                   `transactionFeesAmountInSatoshis` and `desiredLockAmountInSatoshis` will be ignored.
   */
  constructor (
    private bitcoinClient: BitcoinClient,
    private lockTransactionStore: MongoDbLockTransactionStore,
    private lockResolver: LockResolver,
    private pollPeriodInSeconds: number,
    private valueTimeLockUpdateEnabled: boolean,
    private desiredLockAmountInSatoshis: number,
    private transactionFeesAmountInSatoshis: number,
    private lockPeriodInBlocks: number) {

    if (!Number.isInteger(desiredLockAmountInSatoshis)) {
      throw new SidetreeError(ErrorCode.LockMonitorDesiredLockAmountIsNotWholeNumber, `${desiredLockAmountInSatoshis}`);
    }

    if (!Number.isInteger(transactionFeesAmountInSatoshis)) {
      throw new SidetreeError(ErrorCode.LockMonitorTransactionFeesAmountIsNotWholeNumber, `${transactionFeesAmountInSatoshis}`);
    }
  }

  /**
   * Starts the periodic reading and updating of lock status.
   */
  public async startPeriodicProcessing (): Promise<void> {
    await this.periodicPoll();
  }

  /**
   * Gets the current lock information if exist; undefined otherwise. Throws an error
   * if the lock information is not confirmed on the blockchain.
   */
  public async getCurrentValueTimeLock (): Promise<ValueTimeLockModel | undefined> {
    const currentLockState = await this.getCurrentLockState();

    // If there's no lock then return undefined
    if (currentLockState.status === LockStatus.None) {
      return undefined;
    }

    if (currentLockState.status === LockStatus.Pending) {
      // Throw a very specific error so that the caller can do something
      // about it if they have to
      throw new SidetreeError(ErrorCode.LockMonitorCurrentValueTimeLockInPendingState);
    }

    return currentLockState.activeValueTimeLock;
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
      const message = `An error occurred during periodic poll: ${SidetreeError.stringify(e)}`;
      console.error(message);
    } finally {
      this.periodicPollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * this.pollPeriodInSeconds);
    }

    console.info(`Ending periodic polling for the lock monitor.`);
  }

  private async handlePeriodicPolling (): Promise<void> {
    const currentLockState = await this.getCurrentLockState();
    console.info(`Refreshed the in-memory value time lock state.`);

    // If lock update is disabled, then no further action needs to be taken.
    if (this.valueTimeLockUpdateEnabled === false) {
      console.info(`Value time lock update is disabled, will not attempt to update the value time lock.`);
      return;
    }

    // If the current lock is in pending state then we cannot do anything other than rebroadcast the transaction again.
    if (currentLockState.status === LockStatus.Pending) {
      console.info(`The current lock status is in pending state, rebroadcast the transaction again in case the transaction is lost in the previous broadcast.`);
      await this.rebroadcastTransaction(currentLockState.latestSavedLockInfo!);
      return;
    }

    // Now that we are not pending, check what do we have to do about the lock next.
    const validCurrentLockExist = currentLockState.status === LockStatus.Confirmed;
    const lockRequired = this.desiredLockAmountInSatoshis > 0;

    if (lockRequired && !validCurrentLockExist) {
      await this.handleCreatingNewLock(this.desiredLockAmountInSatoshis);
    }

    if (lockRequired && validCurrentLockExist) {
      // The routine will true only if there were any changes made to the lock
      await this.handleExistingLockRenewal(
        currentLockState.activeValueTimeLock!,
        currentLockState.latestSavedLockInfo!,
        this.desiredLockAmountInSatoshis
      );
    }

    if (!lockRequired && validCurrentLockExist) {
      console.info(LogColor.lightBlue(`Value time lock no longer needed.`));

      await this.handleReleaseExistingLock(
        currentLockState.activeValueTimeLock!,
        this.desiredLockAmountInSatoshis
      );
    }
  }

  private async getCurrentLockState (): Promise<LockState> {

    const lastSavedLock = await this.lockTransactionStore.getLastLock();

    // Nothing to do if there's nothing found.
    if (!lastSavedLock) {
      return {
        activeValueTimeLock: undefined,
        latestSavedLockInfo: undefined,
        status: LockStatus.None
      };
    }

    console.info(`Found last saved lock of type: ${lastSavedLock.type} with transaction id: ${lastSavedLock.transactionId}.`);

    // Make sure that the last lock txn is actually broadcasted to the blockchain. Rebroadcast
    // if it is not as we don't want to do anything until last lock information is at least
    // broadcasted.
    if (!(await this.isTransactionBroadcasted(lastSavedLock.transactionId))) {
      return {
        activeValueTimeLock: undefined,
        latestSavedLockInfo: lastSavedLock,
        status: LockStatus.Pending
      };
    }

    if (lastSavedLock.type === SavedLockType.ReturnToWallet) {
      // This means that there's no current lock for this node. Just return
      return {
        activeValueTimeLock: undefined,
        latestSavedLockInfo: lastSavedLock,
        status: LockStatus.None
      };
    }

    // If we're here then it means that we have saved some information about a lock
    // which is at least broadcasted to blockchain. Let's resolve it.
    const lastLockIdentifier: LockIdentifier = {
      transactionId: lastSavedLock.transactionId,
      redeemScriptAsHex: lastSavedLock.redeemScriptAsHex
    };

    try {
      const currentValueTimeLock = await this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);

      console.info(`Found a valid current lock: ${JSON.stringify(currentValueTimeLock)}`);

      return {
        activeValueTimeLock: currentValueTimeLock,
        latestSavedLockInfo: lastSavedLock,
        status: LockStatus.Confirmed
      };

    } catch (e) {

      if (e instanceof SidetreeError && e.code === ErrorCode.LockResolverTransactionNotConfirmed) {
        // This means that the transaction was broadcasted but hasn't been written on the blockchain yet.
        return {
          activeValueTimeLock: undefined,
          latestSavedLockInfo: lastSavedLock,
          status: LockStatus.Pending
        };
      }

      // Else this is an unexpected exception rethrow
      throw e;
    }
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

  private async isTransactionBroadcasted (transactionId: string): Promise<boolean> {
    try {
      await this.bitcoinClient.getRawTransaction(transactionId);

      // no exception thrown == transaction found == it was broadcasted even if it is only in the mempool.
      return true;
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
      throw new SidetreeError(ErrorCode.LockMonitorNotEnoughBalanceForFirstLock,
                             `Lock amount: ${totalLockAmount}; Wallet balance: ${walletBalance}`);
    }

    console.info(LogColor.lightBlue(`Current wallet balance: ${LogColor.green(walletBalance)}`));
    console.info(LogColor.lightBlue(`Creating a new lock for amount: ${LogColor.green(totalLockAmount)} satoshis.`));

    const lockTransaction = await this.bitcoinClient.createLockTransaction(totalLockAmount, this.lockPeriodInBlocks);

    return this.saveThenBroadcastTransaction(lockTransaction, SavedLockType.Create, desiredLockAmountInSatoshis);
  }

  /**
   * Performs the lock renewal routine.
   *
   * @param currentValueTimeLock The current value time lock if any.
   * @param latestSavedLockInfo The last saved locked info.
   * @param desiredLockAmountInSatoshis The desired lock amount.
   *
   * @returns true if any updates were made to the lock, false otherwise.
   */
  private async handleExistingLockRenewal (
    currentValueTimeLock: ValueTimeLockModel,
    latestSavedLockInfo: SavedLockModel,
    desiredLockAmountInSatoshis: number): Promise<boolean> {

    // Just return if we haven't reached the unlock block yet
    if (!(await this.isUnlockTimeReached(currentValueTimeLock.unlockTransactionTime))) {
      return false;
    }

    // If the desired lock amount is different from previous then just return the amount to
    // the wallet and let the next poll iteration start a new lock.
    if (latestSavedLockInfo.desiredLockAmountInSatoshis !== desiredLockAmountInSatoshis) {
      console.info(LogColor.lightBlue(`Current desired lock amount ${LogColor.green(desiredLockAmountInSatoshis)} satoshis is different from the previous `) +
        LogColor.lightBlue(`desired lock amount ${LogColor.green(latestSavedLockInfo.desiredLockAmountInSatoshis)} satoshis. Going to release the lock.`));

      await this.releaseLock(currentValueTimeLock, desiredLockAmountInSatoshis);
      return true;
    }

    // If we have gotten to here then we need to try renew.
    try {
      await this.renewLock(currentValueTimeLock, desiredLockAmountInSatoshis);
    } catch (e) {

      // If there is not enough balance for the relock then just release the lock. Let the next
      // iteration of the polling to try and create a new lock.
      if (e instanceof SidetreeError && e.code === ErrorCode.LockMonitorNotEnoughBalanceForRelock) {
        console.warn(LogColor.yellow(`There is not enough balance for relocking so going to release the lock. Error: ${e.message}`));
        await this.releaseLock(currentValueTimeLock, desiredLockAmountInSatoshis);
      } else {
        // This is an unexpected error at this point ... rethrow as this is needed to be investigated.
        throw (e);
      }
    }

    return true;
  }

  /**
   * Performs the release lock routine.
   *
   * @param currentValueTimeLock The current value time lock
   * @param desiredLockAmountInSatoshis The desired lock amount
   *
   * @returns true if any updates were made to the lock, false otherwise.
   */
  private async handleReleaseExistingLock (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<boolean> {

    // Don't continue unless the current lock time model is actually reached
    if (!(await this.isUnlockTimeReached(currentValueTimeLock.unlockTransactionTime))) {
      return false;
    }

    console.info(LogColor.lightBlue(`Value time lock no longer needed and unlock time reached, releasing lock...`));

    await this.releaseLock(currentValueTimeLock, desiredLockAmountInSatoshis);

    console.info(LogColor.lightBlue(`Value time lock released.`));

    return true;
  }

  private async renewLock (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {

    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentValueTimeLock.identifier);
    const currentLockDuration = currentValueTimeLock.unlockTransactionTime - currentValueTimeLock.lockTransactionTime;

    const relockTransaction =
      await this.bitcoinClient.createRelockTransaction(
        currentLockIdentifier.transactionId,
        currentLockDuration,
        this.lockPeriodInBlocks);

    // If the transaction fee is making the relock amount less than the desired amount
    if (currentValueTimeLock.amountLocked - relockTransaction.transactionFee < desiredLockAmountInSatoshis) {
      throw new SidetreeError(
        ErrorCode.LockMonitorNotEnoughBalanceForRelock,
        // eslint-disable-next-line max-len
        `The current locked amount (${currentValueTimeLock.amountLocked} satoshis) minus the relocking fee (${relockTransaction.transactionFee} satoshis) is causing the relock amount to go below the desired lock amount: ${desiredLockAmountInSatoshis}`);
    }

    return this.saveThenBroadcastTransaction(relockTransaction, SavedLockType.Relock, desiredLockAmountInSatoshis);
  }

  private async releaseLock (currentValueTimeLock: ValueTimeLockModel, desiredLockAmountInSatoshis: number): Promise<SavedLockModel> {
    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentValueTimeLock.identifier);
    const currentLockDuration = currentValueTimeLock.unlockTransactionTime - currentValueTimeLock.lockTransactionTime;

    const releaseLockTransaction =
      await this.bitcoinClient.createReleaseLockTransaction(
        currentLockIdentifier.transactionId,
        currentLockDuration);

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

  private async isUnlockTimeReached (unlockTransactionTime: number): Promise<boolean> {
    const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();

    console.info(`Current block: ${currentBlockTime}; Current lock's unlock block: ${unlockTransactionTime}`);

    return currentBlockTime >= unlockTransactionTime;
  }
}
