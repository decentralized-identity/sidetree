import { IBitcoinConfig } from './BitcoinConfig';
import TransactionNumber from './TransactionNumber';
import { ITransaction } from '../core/Transaction';
import SidetreeError from '../core/util/SidetreeError';

/**
 * Object representing a blockchain time and hash
 */
export interface IBlockchainTime {
  /** The logical blockchain time */
  time: number;
  /** The hash associated with the blockchain time */
  hash: string;
}

/**
 * Processor for bitcoin REST API calls
 */
export default class BitcoinProcessor {

  /** URI for the bcoin service */
  public readonly bcoinServiceUri: string;
  /** Prefix used to identify Sidetree transactions in Bitcoin's blockchain. */
  public readonly sidetreePrefix: string;
  /** The first Sidetree transaction number in Bitcoin's blockchain. */
  public readonly genesisTransactionNumber: number;
  /** The corresponding time hash of genesis transaction number. */
  public readonly genesisTimeHash: string;

  public constructor (config: IBitcoinConfig) {
    this.bcoinServiceUri = 'localhost:18331';
    this.sidetreePrefix = 'ion:';
    this.genesisTransactionNumber = TransactionNumber.construct(config.bitcoinSidetreeGenesisBlockNumber, 0);
    this.genesisTimeHash = '1480000';
  }

  // public async initialize (): {
  //   // foo
  // }

  /**
   * Gets the latest logical blockchain time.
   * @param hash time blockchain time hash
   * @returns the current or associated blockchain time and blockchain hash
   */
  public async time (hash?: string): Promise<IBlockchainTime> {
    throw new Error('not implemented');
  }

  /**
   * Fetches Sidetree transactions in chronological order from since or genesis.
   * @param since A transaction number
   * @param hash The associated transaction time hash
   * @returns Transactions since that blocktime
   */
  public async transactions (since?: number, hash?: string): Promise<{
    moreTransactions: boolean,
    transations: ITransaction[]
  }> {
    if (since && !hash) {
      throw new SidetreeError(httpStatus.BAD_REQUEST);
    }
    if (!since || !hash) {
      since = this.genesisTransactionNumber;
      hash = this.genesisTimeHash;
    }
  }

  /**
   * Given a list of Sidetree transactions, returns the first transaction in the list that is valid.
   * @param transactions List of transactions to check
   * @returns The first valid transaction, or undefined if none are valid
   */
  public async firstValidTransaction (transactions: ITransaction[]): Promise<ITransaction | undefined> {
    throw new Error('not implemented');
  }

  /**
   * Writes a Sidetree transaction to the underlying Bitcoin's blockchain.
   * @param anchorFileHash The hash of a Sidetree anchor file
   */
  public async writeTransaction (anchorFileHash: string): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * Processes transactions from startBlock to endBlock or tip
   * @param startBlock The blockheight to begin from
   * @param endBlock The blockheight to stop on (inclusive)
   */
  private async processTransactions (startBlock: number, endBlock?: number) {
    throw new Error('not implemented');
  }

}
