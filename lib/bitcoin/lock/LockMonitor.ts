import BitcoinClient from '../BitcoinClient';
import LockResolver from './LockResolver';
import MongoDbLockTransactionStore from './MongoDbLockTransactionStore';
import SavedLockTransactionModel from '../models/SavedLockTransactionModel';
import SavedLockTransactionType from '../enums/SavedLockTransactionType';

/**
 * Encapsulates functionality to monitor and create/remove amount locks on bitcoin.
 */
export default class LockMonitor {

  private static numberOfBlocksInOneMonth = 6 * 24 * 30;

  private pollTimeoutId: number | undefined;

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

      const lastLock = this.lockTransactionStore.getLastLock();
      const lockRequired = this.lockAmountInSatoshis > 0;

      if (lockRequired && lastLock) {
        // check lock expiry etc and relock if necessary; update db
      }

      if (lockRequired && !lastLock) {
        // create lock and save to db
      }

      if (!lockRequired && lastLock) {
        // remove lock and update db
      }
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * interval, interval);
    }
  }

  // @ts-ignore
  private async createFirstLock (lockAmountInSatoshis: number): Promise<SavedLockTransactionModel> {
    const walletBalance = await this.bitcoinClient.getBalanceInSatoshis();

    if (walletBalance <= lockAmountInSatoshis) {
      // Throw an error
    }

    const freezeUntilBlock = await this.bitcoinClient.getBalanceInSatoshis() + LockMonitor.numberOfBlocksInOneMonth;
    const lockTransaction = await this.bitcoinClient.createLockTransaction(lockAmountInSatoshis, freezeUntilBlock);

    const lockInfoToSave: SavedLockTransactionModel = {
      transactionId: lockTransaction.transactionId,
      redeemScript: lockTransaction.redeemScript,
      createTimestamp: Date.now(),
      type: SavedLockTransactionType.Create
    };

    await this.lockTransactionStore.addLock(lockInfoToSave);

    await this.bitcoinClient.broadcastLockTransaction(lockTransaction);

    return lockInfoToSave;
  }
}
