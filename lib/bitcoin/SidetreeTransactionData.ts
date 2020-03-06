import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';

/**
 * Encapsulates functionality about a sidetree transaction written on the bitcoin.
 */
export default class SidetreeTransactionData {

  private constructor (
    public readonly data: string,
    public readonly writer: string) {
  }

  /**
   * Parses the given transaction and returns the sidetree transaction object.
   *
   * @param bitcoinTransaction The transaction to parse.
   * @param sidetreePrefix The prefix of the sidetree transactions.
   *
   * @returns This object if the transaction is a valid sidetree transaction; undefined otherwise.
   */
  public static parse (bitcoinTransaction: BitcoinTransactionModel, sidetreePrefix: string): SidetreeTransactionData | undefined {

    // The sidetree transaction has the following requirements:
    //  1. The number of outputs must be 2
    //  2. The first output must be an OP_RETURN with the sidetree anchorstring
    //  3. The second output must be the remaining amount returning to the wallet which wrote the data
    //
    // Example transaction: https://www.blockchain.com/btctest/tx/9ad72b164a6315521403cf80eafeaf7af880bdc737e09fe4adaee171f4fe381f

    if (bitcoinTransaction.outputs.length !== 2) {
      return undefined;
    }

    const sidetreeData = this.getSidetreeDataFromVOutIfExist(bitcoinTransaction.outputs[0], sidetreePrefix);

    if (!sidetreeData) {
      return undefined;
    }

    const writer = this.getWriterFromVOutIfExist(bitcoinTransaction.outputs[1]);

    if (!writer) {
      return undefined;
    }

    return new SidetreeTransactionData(sidetreeData, writer);
  }

  private static getSidetreeDataFromVOutIfExist (transactionOutput: BitcoinOutputModel, sidetreePrefix: string): string | undefined {

    // check for returned data for sidetree prefix
    const hexDataMatches = transactionOutput.scriptAsmAsString.match(/\s*OP_RETURN ([0-9a-fA-F]+)$/);

    if (hexDataMatches && hexDataMatches.length !== 0) {

      const data = Buffer.from(hexDataMatches[1], 'hex').toString();

      if (data.startsWith(sidetreePrefix)) {
        return data.slice(sidetreePrefix.length);
      }
    }

    // Nothing was found
    return undefined;
  }

  private static getWriterFromVOutIfExist (transactionOutput: BitcoinOutputModel): string | undefined {

    if (!transactionOutput.scriptAsmAsString) {
      return undefined;
    }

    const scriptAsmParts = transactionOutput.scriptAsmAsString.split(' ');

    const scriptIsValid = scriptAsmParts.length === 5 &&
                          scriptAsmParts[0] === 'OP_DUP' &&
                          scriptAsmParts[1] === 'OP_HASH160' &&
                          scriptAsmParts[3] === 'OP_EQUALVERIFY' &&
                          scriptAsmParts[4] === 'OP_CHECKSIG';

    if (scriptIsValid) {
      return scriptAsmParts[2];
    }

    return undefined;
  }
}
