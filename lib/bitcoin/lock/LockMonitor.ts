import BitcoinClient from '../BitcoinClient';
import BlockchainLockModel from '../../common/models/BlockchainLockModel';
import SavedLockTransactionType from '../enums/SavedLockTransactionType';
import LockIdentifier from '../models/LockIdentifierModel';
import LockIdentifierSerializer from './LockIdentifierSerializer';
import LockResolver from './LockResolver';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import SavedLockTransactionModel from '../models/SavedLockTransactionModel';

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private static numberOfBlocksInOneMonth = 6 * 24 * 30;

  private pollTimeoutId: number | undefined;

  private lastValidBlockchainLock: BlockchainLockModel | undefined;

  // @ts-ignore
  private lockResolver: LockResolver;

  constructor (
    private bitcoinClient: BitcoinClient,
    private lockTransactionStore: MongoDbLockTransactionStore,
    private pollPeriod: number,
    private lockAmountInSatoshis: number) {

    this.lockResolver = new LockResolver(this.bitcoinClient);
  }

  /**
   * Initializes this object by either creating a lock/relock or returning the amount
   * back to the target bitcoin wallet if needed.
   */
  public async initialize (): Promise<void> {
    await this.periodicPoll();
  }

  private async periodicPoll (interval: number = this.pollPeriod) {

    try {
      // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
      if (this.pollTimeoutId) {
        clearTimeout(this.pollTimeoutId);
      }

      this.lastValidBlockchainLock = await this.getLastValidLockCreatedByThisNode();

      const lastLockExist = this.lastValidBlockchainLock !== undefined;
      const lockRequired = this.lockAmountInSatoshis > 0;

      if (lockRequired && !lastLockExist) {
        await this.createFirstLockAndSaveItToDb(this.lockAmountInSatoshis);
      }

      if (lockRequired && lastLockExist) {
        const currentBlockTime = await this.bitcoinClient.getCurrentBlockHeight();
        const expiryMinusCurrentBlockTime = this.lastValidBlockchainLock!.lockEndTransactionTime - currentBlockTime;

        // If about to expire then renew
        if (expiryMinusCurrentBlockTime <= 1) {
          await this.renewExistingLockAndSaveItToDb(this.lockAmountInSatoshis, this.lastValidBlockchainLock!);
        }
      }

      if (!lockRequired && lastLockExist) {
        await this.releaseLockAndSaveItToDb(this.lastValidBlockchainLock!);
      }

      this.lastValidBlockchainLock = await this.getLastValidLockCreatedByThisNode();
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * interval, interval);
    }
  }

  private async getLastValidLockCreatedByThisNode (): Promise<BlockchainLockModel | undefined> {
    const lastLock = await this.lockTransactionStore.getLastLock();

    // If there's nothing found or the last known transaction was returning
    // amount to the wallet then there's no last known valid lock.
    if (!lastLock || lastLock.type === SavedLockTransactionType.ReturnToWallet) {
      return undefined;
    }

    try {
      const lastLockIdentifier: LockIdentifier = {
        transactionId: lastLock.transactionId,
        redeemScriptAsHex: lastLock.redeemScriptAsHex,
        walletAddressAsBuffer: this.bitcoinClient.getWalletAddressAsBuffer()
      };

      return this.lockResolver.resolveLockIdentifierAndThrowOnError(lastLockIdentifier);
    } catch (e) {
      // Any errors during lock resolution means:
      //  1. The lock info was saved but never got broadcasted (NEED TO HANDLE THIS CASE)
      //  2. The lock info was invalid ... this COULD happen and is probably a bug that should be fixed.

    }

    return undefined;
  }

  private async createFirstLockAndSaveItToDb (lockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {
    const walletBalance = await this.bitcoinClient.getBalanceInSatoshis();

    if (walletBalance <= lockAmountInSatoshis) {
      // Throw an error
    }

    const freezeUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + LockMonitor.numberOfBlocksInOneMonth;
    const lockTransaction = await this.bitcoinClient.createLockTransaction(lockAmountInSatoshis, freezeUntilBlock);

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

  private async renewExistingLockAndSaveItToDb (_lockAmountInSatoshis: number, currentLockInfo: BlockchainLockModel): Promise<SavedLockTransactionModel> {
    // Verify that the existing lock amount and the amount desired is within an acceptable range.
    // Throw error if it is not.

    const currentLockIdentifier = LockIdentifierSerializer.deserialize(currentLockInfo.identifier);
    const freezeUntilBlock = await this.bitcoinClient.getCurrentBlockHeight() + LockMonitor.numberOfBlocksInOneMonth;
    const relockTransaction =
      await this.bitcoinClient.createRelockTransaction(
          currentLockIdentifier.transactionId,
          currentLockInfo.lockEndTransactionTime,
          freezeUntilBlock);

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
      type: SavedLockTransactionType.Relock
    };

    await this.lockTransactionStore.addLock(lockInfoToSave);

    await this.bitcoinClient.broadcastLockTransaction(releaseLockTransaction);

    return lockInfoToSave;
  }
}
