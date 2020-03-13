import BitcoinClient from './BitcoinClient';
import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import SidetreeTransactionModel from './models/SidetreeTransactionModel';
import { crypto } from 'bitcore-lib';

/**
 * Encapsulates functionality about a sidetree transaction written on the bitcoin.
 */
export default class SidetreeTransactionParser {

  // @ts-ignore
  public constructor (private bitcoinClient: BitcoinClient) {
  }

  /**
   * Parses the given transaction and returns the sidetree transaction object.
   *
   * @param bitcoinTransaction The transaction to parse.
   * @param sidetreePrefix The prefix of the sidetree transactions.
   *
   * @returns This object if the transaction is a valid sidetree transaction; undefined otherwise.
   */
  public parse (bitcoinTransaction: BitcoinTransactionModel, sidetreePrefix: string): SidetreeTransactionModel | undefined {

    // Example valid transaction: https://www.blockchain.com/btctest/tx/a98fd29d4583d1f691067b0f92ae83d3808d18cba55bd630dbf569fbaea9355c

    const sidetreeData = this.getValidSidetreeDataFromOutputs(bitcoinTransaction.id, bitcoinTransaction.outputs, sidetreePrefix);

    if (!sidetreeData) {
      return undefined;
    }

    const writer = this.getValidWriterFromInputs(bitcoinTransaction.id, bitcoinTransaction.inputs);

    if (!writer) {
      console.info(`Valid sidetree data was found but no valid writer was found for transaction id: ${bitcoinTransaction.id}`);
      return undefined;
    }

    return {
      data: sidetreeData,
      writer: writer
    };
  }

  private getValidSidetreeDataFromOutputs (transactionId: string, transactionOutputs: BitcoinOutputModel[], sidetreePrefix: string): string | undefined {

    // The sidetree transaction output has the following requirements:
    //  1. There must be only one output with a valid sidetree anchorstring

    let sidetreeDataToReturn: string | undefined = undefined;

    for (let i = 0; i < transactionOutputs.length; i++) {
      const currentOutput = transactionOutputs[i];
      const sidetreeDataForThisOutput = this.getSidetreeDataFromOutputIfExist(currentOutput, sidetreePrefix);

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

  private getSidetreeDataFromOutputIfExist (transactionOutput: BitcoinOutputModel, sidetreePrefix: string): string | undefined {

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

  private getValidWriterFromInputs (transactionId: string, transactionInputs: BitcoinInputModel[]): string | undefined {

    const validPublickey = this.getValidPublicKeyFromInputs(transactionId, transactionInputs);

    if (!validPublickey) {
      return undefined;
    }

    // This library uses the public-key-hash-output format of the public key as the writer so
    // convert the public key into the expected foramat.
    const publicKeyAsBuffer = Buffer.from(validPublickey, 'hex');
    const publicKeyHashBuffer = crypto.Hash.sha256ripemd160(publicKeyAsBuffer);

    return publicKeyHashBuffer.toString('hex');
  }

  private getValidPublicKeyFromInputs (transactionId: string, transactionInputs: BitcoinInputModel[]): string | undefined {

    // A valid sidetree transaction inputs have following requirements:
    //  1. The first input must be in format: <signature> <publickey>
    //  2. The output being spent by the first input must be in the pay-to-public-key-hash output.
    //  3. The first input checks will prove that the writer of the txn owns the <publickey><privatekey> pair
    //     so we won't check any other inputs.
    //
    // The output will be the <publickey> from the first input.

    // First get all the public keys from the inputs
    const allPublicKeys = transactionInputs.map(input => {
      const scriptAsmParts = input.scriptAsmAsString.split(' ');

      // Issue #271: Figure out whether assuming the 2nd one as the public key is ok or not.
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
