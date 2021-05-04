import BitcoinClient from './BitcoinClient';

/**
 * Monitor for the running Bitcoin service.
 */
export default class Monitor {

  public constructor (private bitcoinClient: BitcoinClient) { }

  /**
   * Gets the size of the operation queue.
   */
  public async getWalletBalance (): Promise<any> {
    const walletBalanceInSatoshis = await this.bitcoinClient.getBalanceInSatoshis();
    const walletBalanceInBtc = walletBalanceInSatoshis / 100000000;
    return { walletBalanceInBtc };
  }
}
