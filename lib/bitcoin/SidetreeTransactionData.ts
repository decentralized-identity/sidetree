import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import { crypto } from 'bitcore-lib';

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
    //  1. There must be only one output with a valid sidetree anchorstring

    //  2. All the inputs must have the same receiving public key
    //
    // Example transaction: https://www.blockchain.com/btctest/tx/a98fd29d4583d1f691067b0f92ae83d3808d18cba55bd630dbf569fbaea9355c

    const sidetreeData = SidetreeTransactionData.getValidSidetreeDataFromOutputs(bitcoinTransaction.id, bitcoinTransaction.outputs, sidetreePrefix);

    if (!sidetreeData) {
      return undefined;
    }

    const writer = SidetreeTransactionData.getValidWriterFromInputs(bitcoinTransaction.id, bitcoinTransaction.inputs);

    if (!writer) {
      console.info(`Valid sidetree data was found but no valid writer was found for transaction id: ${bitcoinTransaction.id}`);
      return undefined;
    }

    return new SidetreeTransactionData(sidetreeData, writer);
  }

  private static getValidSidetreeDataFromOutputs (transactionId: string, transactionOutputs: BitcoinOutputModel[], sidetreePrefix: string): string | undefined {

    let sidetreeDataToReturn: string | undefined = undefined;

    for (let i = 0; i < transactionOutputs.length; i++) {
      const currentOutput = transactionOutputs[i];
      const sidetreeDataForThisOutput = SidetreeTransactionData.getSidetreeDataFromOutputIfExist(currentOutput, sidetreePrefix);

      if (sidetreeDataForThisOutput) {

        const oneSidetreeDataAlreadyFound = sidetreeDataToReturn !== undefined;

        if (oneSidetreeDataAlreadyFound) {
          console.info(`More than one sidetree transactions were found in the outputs of transaction id: ${transactionId}`);
          return undefined;
        }

        sidetreeDataToReturn = sidetreeDataForThisOutput;
      }
    }

    return sidetreeDataToReturn;
  }

  private static getSidetreeDataFromOutputIfExist (transactionOutput: BitcoinOutputModel, sidetreePrefix: string): string | undefined {

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

  private static getValidWriterFromInputs (transactionId: string, transactionInputs: BitcoinInputModel[]): string | undefined {

    const validPublickey = SidetreeTransactionData.getValidPublicKeyFromInputs(transactionId, transactionInputs);

    if (!validPublickey) {
      return undefined;
    }

    // This library uses the public-key-hash-output format of the public key as the writer so
    // convert the public key into the expected foramat.
    const publicKeyAsBuffer = Buffer.from(validPublickey, 'hex');
    const publicKeyHashBuffer = crypto.Hash.sha256ripemd160(publicKeyAsBuffer);

    return publicKeyHashBuffer.toString('hex');
  }

  private static getValidPublicKeyFromInputs (transactionId: string, transactionInputs: BitcoinInputModel[]): string | undefined {

    // First get all the public keys from the inputs
    const allPublicKeys = transactionInputs.map(input => {
      const scriptAsmParts = input.scriptAsmAsString.split(' ');

      // If the publickey is not present then just use 'undefined'
      return scriptAsmParts.length >= 2 ? scriptAsmParts[1] : undefined;
    });

    // Save all the unique public keys.
    const uniquePublicKeys = new Set<string | undefined>();
    for (let i = 0; i < transactionInputs.length; i++) {
      uniquePublicKeys.add(allPublicKeys[i]);
    }

    // There should be only 1 key in all of the inputs; so if we have more than 1 then that is invalid.
    if (uniquePublicKeys.size !== 1) {
      console.info(`More than one public key inputs were found in transaction id: ${transactionId}`);
      return undefined;
    }

    // If we are here then there's only one public key, return it.
    return allPublicKeys[0];
  }
}
