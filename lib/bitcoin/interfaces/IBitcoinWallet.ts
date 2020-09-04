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
   * Signs the specified freeze transaction using the keys associated with this wallet. The freeze transaction is
   * the one which freezes the funds from a previously unfrozen outputs.
   *
   * @param transaction The transaction to sign.
   * @param outputRedeemScript The redeem script for the frozen output.
   *
   * @returns The signed transaction.
   */
  signFreezeTransaction (transaction: Transaction, outputRedeemScript: Script): Promise<Transaction>;

  /**
   * Signs the specified transaction using the keys associated with this wallet.
   *
   * @param lockTransaction The lock transaction to sign.
   * @param outputRedeemScript The redeem script if the transaction is another freeze; undefined otherwise.
   * @param inputRedeemScript The redeem script for the previously frozen transaction.
   * @returns The signed transaction.
   */
  signSpendFromFreezeTransaction (lockTransaction: Transaction, inputRedeemScript: Script, outputRedeemScript: Script | undefined): Promise<Transaction>;
}
