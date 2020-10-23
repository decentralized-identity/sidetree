import { PrivateKey, Transaction } from 'bitcore-lib';
import BitcoinBlockModel from '../../lib/bitcoin/models/BitcoinBlockModel';
import BitcoinClient from '../../lib/bitcoin/BitcoinClient';

/**
 * Encapsulates the functions that help with generating the test data for the Bitcoin blockchain.
 */
export default class BitcoinDataGenerator {

  private static randomString (length: number = 16): string {
    return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
  }

  private static randomNumber (max: number = 256): number {
    return Math.round(Math.random() * max);
  }

  /**
   * Generates a new bitcoin transaction.
   * @param wif Input to generate the private key.
   * @param satoshis The amount of satoshis to include in the transaction
   */
  public static generateBitcoinTransaction (wif: string, satoshis: number = 1): Transaction {
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
  public static generateUnspentCoin (wif: string, satoshis: number): Transaction.UnspentOutput {
    const transaction = BitcoinDataGenerator.generateBitcoinTransaction(wif, satoshis);
    return new Transaction.UnspentOutput({
      txid: transaction.id,
      vout: 0,
      address: transaction.outputs[0].script.getAddressInfo(),
      amount: transaction.outputs[0].satoshis * 0.00000001, // Satoshi amount
      script: transaction.outputs[0].script
    });
  }

  /**
   * Generates test block for bitcoin.
   */
  public static generateBlock (blockHeight: number, data?: () => string | string[] | undefined): BitcoinBlockModel {
    const tx: Transaction[] = [];
    const count = BitcoinDataGenerator.randomNumber(100) + 10;
    for (let i = 0; i < count; i++) {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(BitcoinClient.generatePrivateKey('testnet'), 1);
      // data generation
      if (data) {
        const hasData = data();

        // if the data returned is an array then add each value one by one.
        // otherwise add the single value
        if (hasData instanceof Array) {
          hasData.forEach(element => {
            transaction.addData(Buffer.from(element));
          });
        } else if (hasData) {
          transaction.addData(Buffer.from(hasData));
        }
      }

      tx.push(transaction);
    }

    const blockHash = BitcoinDataGenerator.randomString();

    return {
      hash: blockHash,
      height: blockHeight,
      previousHash: BitcoinDataGenerator.randomString(),
      transactions: tx.map((txn) => {
        return {
          id: txn.id,
          blockHash: blockHash,
          confirmations: BitcoinDataGenerator.randomNumber(),
          inputs: txn.inputs.map((input) => { return BitcoinClient['createBitcoinInputModel'](input); }),
          outputs: txn.outputs.map((output) => { return BitcoinClient['createBitcoinOutputModel'](output); })
        };
      })
    };
  }
}
