import BlockData from '../models/BlockData';
import { Address, Transaction } from 'bitcore-lib';

/**
 * Defines functionality for a class which handles the reading/writing data for the bitcoin ledger layer.
 */
export default interface IBitcoinLedger {

  /**
   * Broadcasts a transaction to the bitcoin network
   * @param transaction Transaction to broadcast
   */
  broadcastTransaction (transaction: Transaction): Promise<boolean>;

  /**
   * Gets the block data for the given block hash.
   * @param hash The hash of the block
   * @param verbosity The verbosity level; default = 1 (1: minimal, 2: detailed)
   */
  getBlock (hash: string, verbosity: number): Promise<BlockData>;

  /**
   * Gets the block hash for a given block height
   * @param height The height to get a hash for
   * @returns the block hash
   */
  getBlockHash (height: number): Promise<string>;

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  getCurrentBlockHeight (): Promise<number>;

  /**
   * Gets all unspent coins of a given address
   * @param address Bitcoin address to get coins for
   */
  getUnspentCoins (address: Address): Promise<Transaction.UnspentOutput[]>;

  /**
   * Start watching a public key.
   * @param publicKeyInHex The key to start 'watched'.
   * @param rescan Rescan the wallet for transaction again.
   */
  importPublicKey (publicKeyAsHex: string, rescan: boolean): Promise<void>;

  /**
   * Checks if the bitcoin peer has a wallet open for a given address
   * @param address The bitcoin address to check
   * @returns true if a wallet exists, false otherwise.
   */
  walletExists (address: string): Promise<boolean>;
}
