import { PrivateKey, Transaction } from 'bitcore-lib';

/**
 * Encapsulates the functions that help with generating the test data for the Bitcoin blockchain.
 */
export default class BitcoinDataGenerator {
  /**
   * Generates a new bitcoin transaction.
   * @param wif Input to generate the private key.
   * @param satoshis The amount of satoshis to include in the transaction
   */
  public static generateBitcoinTransaction(
    wif: string,
    satoshis: number = 1
  ): Transaction {
    const keyObject: PrivateKey = (PrivateKey as any).fromWIF(wif);
    const address = keyObject.toAddress();
    const transaction = new Transaction();
    transaction.to(address, satoshis);
    transaction.change(address);
    return transaction;
  }

  /**
   * Generates test unspent coins data.
   * @param wif Input to generate the private key.
   * @param satoshis The amount of satoshis to include in the transaction
   */
  public static generateUnspentCoin(
    wif: string,
    satoshis: number
  ): Transaction.UnspentOutput {
    const transaction = BitcoinDataGenerator.generateBitcoinTransaction(
      wif,
      satoshis
    );
    return new Transaction.UnspentOutput({
      txid: transaction.id,
      vout: 0,
      address: transaction.outputs[0].script.getAddressInfo(),
      amount: transaction.outputs[0].satoshis * 0.00000001, // Satoshi amount
      script: transaction.outputs[0].script
    });
  }
}
