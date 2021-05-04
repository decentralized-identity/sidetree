import BitcoinClient from './BitcoinClient';
import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import Logger from '../common/Logger';
import SidetreeError from '../common/SidetreeError';
import SidetreeTransactionModel from './models/SidetreeTransactionModel';

/**
 * Encapsulates functionality about parsing a sidetree transaction written on the bitcoin.
 */
export default class SidetreeTransactionParser {

  public constructor (private bitcoinClient: BitcoinClient, private sidetreePrefix: string) { }

  /**
   * Parses the given transaction and returns the sidetree transaction object.
   *
   * @param bitcoinTransaction The transaction to parse.
   *
   * @returns The data model if the specified transaction is a valid sidetree transaction; undefined otherwise.
   */
  public async parse (bitcoinTransaction: BitcoinTransactionModel): Promise<SidetreeTransactionModel | undefined> {

    const sidetreeData = this.getValidSidetreeDataFromOutputs(bitcoinTransaction.outputs, this.sidetreePrefix);

    if (!sidetreeData) {
      return undefined;
    }

    const writer = await this.getValidWriterFromInputs(bitcoinTransaction.id, bitcoinTransaction.inputs);

    if (!writer) {
      Logger.info(`Valid sidetree data was found but no valid writer was found for transaction id: ${bitcoinTransaction.id}`);
      return undefined;
    }

    return {
      data: sidetreeData,
      writer: writer
    };
  }

  private getValidSidetreeDataFromOutputs (transactionOutputs: BitcoinOutputModel[], sidetreePrefix: string): string | undefined {

    // The sidetree transaction output has the following requirements:
    //  1. We will recognize only the first sidetree anchor string and ignore the rest.

    for (let i = 0; i < transactionOutputs.length; i++) {
      const currentOutput = transactionOutputs[i];
      const sidetreeDataForThisOutput = this.getSidetreeDataFromOutputIfExist(currentOutput, sidetreePrefix);

      if (sidetreeDataForThisOutput) {
        // Sidetree data found .. return it
        return sidetreeDataForThisOutput;
      }
    }

    // Nothing found
    return undefined;
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

  private async getValidWriterFromInputs (transactionId: string, transactionInputs: BitcoinInputModel[]): Promise<string | undefined> {

    // A valid sidetree transaction inputs have following requirements:
    //  A. There must be at least one input.
    //  B. The first input must be in format: <signature> <publickey>
    //  C. The output being spent by the first input must be in the pay-to-public-key-hash output.
    //
    // The first input checks will prove that the writer of the input/txn owns the <publickey><privatekey> pair
    // so we won't check any other inputs.
    //
    // The writer is the hash of the <publickey> which is in the output being spent (C).
    //
    // Example valid transaction: https://www.blockchain.com/btctest/tx/a98fd29d4583d1f691067b0f92ae83d3808d18cba55bd630dbf569fbaea9355c

    // A.
    if (transactionInputs.length < 1) {
      Logger.info(`There must be at least one input in the transaction id: ${transactionId}`);
      return undefined;
    }

    const inputToCheck = transactionInputs[0];

    // B.
    const inputScriptAsmParts = inputToCheck.scriptAsmAsString.split(' ');
    if (inputScriptAsmParts.length !== 2) {
      Logger.info(`The first input must have only the signature and publickey; transaction id: ${transactionId}`);
      return undefined;
    }

    // C.
    const outputBeingSpend = await this.fetchOutput(inputToCheck.previousTransactionId, inputToCheck.outputIndexInPreviousTransaction);

    if (!outputBeingSpend) {
      return undefined;
    }

    return this.getPublicKeyHashIfValidScript(outputBeingSpend.scriptAsmAsString);
  }

  private async fetchOutput (transactionId: string, outputIndexToFetch: number): Promise<BitcoinOutputModel | undefined> {
    try {
      const transaction = await this.bitcoinClient.getRawTransaction(transactionId);
      return transaction.outputs[outputIndexToFetch];
    } catch (e) {
      Logger.error(`Error while trying to get outputIdx: ${outputIndexToFetch} from transaction: ${transactionId}. Error: ${SidetreeError.stringify(e)}`);
      throw e;
    }
  }

  private getPublicKeyHashIfValidScript (scriptAsm: string): string | undefined {
    const scriptAsmParts = scriptAsm.split(' ');

    const isScriptValid =
      scriptAsmParts.length === 5 &&
      scriptAsmParts[0] === 'OP_DUP' &&
      scriptAsmParts[1] === 'OP_HASH160' &&
      scriptAsmParts[3] === 'OP_EQUALVERIFY' &&
      scriptAsmParts[4] === 'OP_CHECKSIG';

    return isScriptValid ? scriptAsmParts[2] : undefined;
  }
}
