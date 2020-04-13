import { Address, Script, Transaction } from 'bitcore-lib';

/**
 * Represents a bitcoin wallet.
 */
export default interface IBitcoinWallet {

  /**
   * Gets the public key associated with this wallet.
   *
   * @returns The public key associated with this wallet as a hex string.
   *
   */
  getPublicKeyAsHex (): string;

  /**
   * Gets the address object associated with this wallet.
   */
  getAddress (): Address;

  /**
   * Signs the specified transaction using the keys associated with this wallet.
   *
   * @param transaction The transaction to sign.
   *
   * @returns The signed transaction.
   */
  signTransaction (transaction: Transaction): Promise<Transaction>;

  /**
   * Signs the specified transaction using the keys associated with this wallet.
   *
   * @param lockTransaction The lock transaction to sign.
   * @param redeemScript The redeem script for the previously frozen transaction.
   * @returns The signed transaction.
   */
  signSpendFromFreezeTransaction (lockTransaction: Transaction, redeemScript: Script): Promise<Transaction>;
}
