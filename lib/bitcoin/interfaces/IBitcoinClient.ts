import BitcoinBlockData from '../models/BitcoinBlockData';
import BitcoinUnspentCoinsModel from '../models/BitcoinUnspentCoinsModel';

/**
 * Defines functionality for a class which handles the reading/writing data for the bitcoin ledger layer.
 */
export default interface IBitcoinClient {

  /**
   * Broadcasts a transaction to the bitcoin network
   * @param transaction Transaction to broadcast
   */
  // broadcastTransaction (transaction: Transaction): Promise<boolean>;

  /**
   * Broadcasts a transaction to the bitcoin network.
   * @param transactionData The data to write to the transaction
   * @param feeInSatoshis The fee for the transaction in satoshis
   * @returns The id of the transaction if broadcasted successfully.
   */
  broadcastTransaction (transactionData: string, feeInSatoshis: number): Promise<string>;

  /**
   * Gets the block data for the given block hash.
   * @param hash The hash of the block
   */
  getBlock (hash: string): Promise<BitcoinBlockData>;

  /**
   * Gets the block hash for a given block height.
   * @param height The height to get a hash for
   * @returns the block hash
   */
  getBlockHash (height: number): Promise<string>;

  /**
   * Gets the block height for the given block hash.
   * @param hash The hash to get the block height for
   */
  getBlockHeight (hash: string): Promise<number>;

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  getCurrentBlockHeight (): Promise<number>;

  /**
   * Gets all unspent coins of a given address
   * @param address Bitcoin address to get coins for
   */
  getUnspentCoins (): Promise<BitcoinUnspentCoinsModel[]>;

  /**
   * Gets the transaction fee of a transaction in satoshis.
   */
  getTransactionFee (transactionId: string): Promise<number>;

  /**
   * Initialize this bitcoin client.
   */
  initialize (): Promise<void>;
}
