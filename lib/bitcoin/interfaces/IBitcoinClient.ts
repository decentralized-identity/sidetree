import BitcoinBlockModel from '../models/BitcoinBlockModel';
import { IBlockInfo } from '../BitcoinProcessor';

/**
 * Defines functionality for a class which handles the reading/writing data for the bitcoin ledger layer.
 */
export default interface IBitcoinClient {

  /**
   * Broadcasts a transaction to the bitcoin network.
   * @param transactionData The data to write to the transaction
   * @param feeInSatoshis The fee for the transaction in satoshis
   * @returns The hash of the transaction if broadcasted successfully.
   */
  broadcastTransaction (transactionData: string, feeInSatoshis: number): Promise<string>;

  /**
   * Gets the block data for the given block hash.
   * @param hash The hash of the block
   */
  getBlock (hash: string): Promise<BitcoinBlockModel>;

  /**
   * Gets the block hash for a given block height.
   * @param height The height to get a hash for
   * @returns the block hash
   */
  getBlockHash (height: number): Promise<string>;

  /**
   * Gets the block info for the given block hash.
   * @param hash The hash of the block
   */
  getBlockInfo (hash: string): Promise<IBlockInfo>;

  /**
   * Gets the block info for the given block height.
   * @param height The height of the block
   */
  getBlockInfoFromHeight (height: number): Promise<IBlockInfo>;

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  getCurrentBlockHeight (): Promise<number>;

  /**
   * Gets all unspent coins of the wallet which is being watched.
   * @returns the balance of the wallet
   */
  getBalanceInSatoshis (): Promise<number>;

  /**
   * Gets the transaction fee of a transaction in satoshis.
   */
  getTransactionFeeInSatoshis (transactionId: string): Promise<number>;

  /**
   * Initialize this bitcoin client.
   */
  initialize (): Promise<void>;
}
