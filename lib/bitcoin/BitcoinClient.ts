import * as httpStatus from 'http-status';
import { Address, Block, Networks, PrivateKey, Script, Transaction, Unit, crypto } from 'bitcore-lib';
import nodeFetch, { FetchError, RequestInit, Response } from 'node-fetch';
import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinLockTransactionModel from './models/BitcoinLockTransactionModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinSidetreeTransactionModel from './models/BitcoinSidetreeTransactionModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import BitcoinWallet from './BitcoinWallet';
import ErrorCode from './ErrorCode';
import IBitcoinWallet from './interfaces/IBitcoinWallet';
import { IBlockInfo } from './BitcoinProcessor';
import Logger from '../common/Logger';
import ReadableStream from '../common/ReadableStream';
import SidetreeError from '../common/SidetreeError';

/**
 * Structure (internal to this class) to store the transaction information
 * as the bitcore-lib.Transaction object does not expose all the properties
 * that we need.
 */
interface BitcoreTransactionWrapper {
  id: string;
  blockHash: string;
  confirmations: number;
  inputs: Transaction.Input[];
  outputs: Transaction.Output[];
}

/**
 * Encapsulates functionality for reading/writing to the bitcoin ledger.
 */
export default class BitcoinClient {

  /** Bitcoin peer's RPC basic authorization credentials */
  private readonly bitcoinAuthorization?: string;

  private readonly bitcoinWallet: IBitcoinWallet;

  /** The wallet name that is created, loaded and used */
  private walletNameToUse = 'sidetreeDefaultWallet';

  constructor (
    private bitcoinPeerUri: string,
    bitcoinRpcUsername: string | undefined,
    bitcoinRpcPassword: string | undefined,
    bitcoinWalletOrImportString: IBitcoinWallet | string,
    readonly requestTimeout: number,
    readonly requestMaxRetries: number,
    private sidetreeTransactionFeeMarkupPercentage: number,
    private estimatedFeeSatoshiPerKB?: number) {

    if (typeof bitcoinWalletOrImportString === 'string') {
      Logger.info('Creating bitcoin wallet using the import string passed in.');
      this.bitcoinWallet = new BitcoinWallet(bitcoinWalletOrImportString);
    } else {
      Logger.info(`Using the bitcoin wallet passed in.`);
      this.bitcoinWallet = bitcoinWalletOrImportString;
    }

    if (bitcoinRpcUsername && bitcoinRpcPassword) {
      this.bitcoinAuthorization = Buffer.from(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`).toString('base64');
    }
  }

  /**
   * Initialize this bitcoin client.
   */
  public async initialize (): Promise<void> {
    // Create and load wallet have to be called because as of bitcoin v0.21, a default wallet is no longer automatically created and loaded
    // https://github.com/bitcoin/bitcoin/pull/15454
    await this.createWallet();
    await this.loadWallet();
    const walletAddress = this.bitcoinWallet.getAddress();

    Logger.info(`Checking if bitcoin contains a wallet for ${walletAddress}`);
    if (!await this.isAddressAddedToWallet(walletAddress.toString())) {
      Logger.info(`Configuring bitcoin peer to watch address ${walletAddress}. This can take up to 10 minutes.`);

      const publicKeyAsHex = this.bitcoinWallet.getPublicKeyAsHex();
      await this.addWatchOnlyAddressToWallet(publicKeyAsHex, true);
    } else {
      Logger.info('Wallet found.');
    }
  }

  /**
   * generates a private key in WIF format
   * @param network Which bitcoin network to generate this key for
   */
  public static generatePrivateKey (network: 'mainnet' | 'livenet' | 'testnet' | undefined): string {
    let bitcoreNetwork: Networks.Network | undefined;
    switch (network) {
      case 'mainnet':
        bitcoreNetwork = Networks.mainnet;
        break;
      case 'livenet':
        bitcoreNetwork = Networks.livenet;
        break;
      case 'testnet':
        bitcoreNetwork = Networks.testnet;
        break;
    }
    return new PrivateKey(undefined, bitcoreNetwork).toWIF();
  }

  /**
   * Converts the amount from BTC to satoshis.
   * @param amountInBtc The amount in BTC
   */
  public static convertBtcToSatoshis (amountInBtc: number): number {
    return Unit.fromBTC(amountInBtc).toSatoshis();
  }

  /**
   * Broadcasts the specified data transaction.
   * @param bitcoinSidetreeTransaction The transaction object.
   */
  public async broadcastSidetreeTransaction (bitcoinSidetreeTransaction: BitcoinSidetreeTransactionModel): Promise<string> {

    return this.broadcastTransactionRpc(bitcoinSidetreeTransaction.serializedTransactionObject);
  }

  /**
   * Broadcasts the specified lock transaction.
   *
   * @param bitcoinLockTransaction The transaction object.
   */
  public async broadcastLockTransaction (bitcoinLockTransaction: BitcoinLockTransactionModel): Promise<string> {
    const transactionHash = await this.broadcastTransactionRpc(bitcoinLockTransaction.serializedTransactionObject);
    Logger.info(`Broadcasted lock transaction: ${transactionHash}`);

    return transactionHash;
  }

  /**
   * Creates (and NOT broadcasts) a transaction to write data to the bitcoin.
   *
   * @param transactionData The data to write in the transaction.
   * @param minimumFeeInSatoshis The minimum fee for the transaction in satoshis.
   */
  public async createSidetreeTransaction (transactionData: string, minimumFeeInSatoshis: number): Promise<BitcoinSidetreeTransactionModel> {
    const transaction = await this.createTransaction(transactionData, minimumFeeInSatoshis);

    const signedTransaction = await this.bitcoinWallet.signTransaction(transaction);
    const serializedTransaction = BitcoinClient.serializeSignedTransaction(signedTransaction);

    return {
      transactionId: signedTransaction.id,
      transactionFee: transaction.getFee(),
      serializedTransactionObject: serializedTransaction
    };
  }

  /**
   * Creates (and NOT broadcasts) a lock transaction using the funds from the linked wallet.
   *
   * NOTE: if the linked wallet outputs are spent then this transaction cannot be broadcasted. So broadcast
   * this transaction before spending from the wallet.
   *
   * @param lockAmountInSatoshis The amount to lock.
   * @param lockDurationInBlocks  The number of blocks to lock the amount for; the amount becomes spendable AFTER this many blocks.
   */
  public async createLockTransaction (lockAmountInSatoshis: number, lockDurationInBlocks: number): Promise<BitcoinLockTransactionModel> {
    const unspentCoins = await this.getUnspentOutputs(this.bitcoinWallet.getAddress());

    const [freezeTransaction, redeemScript] = await this.createFreezeTransaction(unspentCoins, lockDurationInBlocks, lockAmountInSatoshis);

    const signedTransaction = await this.bitcoinWallet.signFreezeTransaction(freezeTransaction, redeemScript);
    const serializedTransaction = BitcoinClient.serializeSignedTransaction(signedTransaction);

    return {
      transactionId: signedTransaction.id,
      transactionFee: freezeTransaction.getFee(),
      redeemScriptAsHex: redeemScript.toHex(),
      serializedTransactionObject: serializedTransaction
    };
  }

  /**
   * Creates (and NOT broadcasts) a lock transaction using the funds from the previously locked transaction.
   *
   * @param existingLockTransactionId The existing transaction with locked output.
   * @param existingLockDurationInBlocks The duration of the existing lock.
   * @param newLockDurationInBlocks The duration for the new lock.
   */
  public async createRelockTransaction (
    existingLockTransactionId: string,
    existingLockDurationInBlocks: number,
    newLockDurationInBlocks: number): Promise<BitcoinLockTransactionModel> {

    const existingLockTransaction = await this.getRawTransactionRpc(existingLockTransactionId);

    const [freezeTransaction, redeemScript] =
      await this.createSpendToFreezeTransaction(existingLockTransaction, existingLockDurationInBlocks, newLockDurationInBlocks);

    // Now sign the transaction
    const previousFreezeScript = BitcoinClient.createFreezeScript(existingLockDurationInBlocks, this.bitcoinWallet.getAddress());
    const signedTransaction = await this.bitcoinWallet.signSpendFromFreezeTransaction(freezeTransaction, previousFreezeScript, redeemScript);

    const serializedTransaction = BitcoinClient.serializeSignedTransaction(signedTransaction);

    return {
      transactionId: signedTransaction.id,
      transactionFee: freezeTransaction.getFee(),
      redeemScriptAsHex: redeemScript.toHex(),
      serializedTransactionObject: serializedTransaction
    };
  }

  /**
   * Creates (and NOT broadcasts) a transaction which outputs the previously locked amount into the linked
   * wallet.
   *
   * @param existingLockTransactionId The existing transaction with locked amount.
   * @param existingLockDurationInBlocks The lock duration for the existing lock.
   */
  public async createReleaseLockTransaction (existingLockTransactionId: string, existingLockDurationInBlocks: number): Promise<BitcoinLockTransactionModel> {
    const existingLockTransaction = await this.getRawTransactionRpc(existingLockTransactionId);

    const releaseLockTransaction = await this.createSpendToWalletTransaction(existingLockTransaction, existingLockDurationInBlocks);

    // Now sign the transaction
    const previousFreezeScript = BitcoinClient.createFreezeScript(existingLockDurationInBlocks, this.bitcoinWallet.getAddress());
    const signedTransaction = await this.bitcoinWallet.signSpendFromFreezeTransaction(releaseLockTransaction, previousFreezeScript, undefined);

    const serializedTransaction = BitcoinClient.serializeSignedTransaction(signedTransaction);

    return {
      transactionId: signedTransaction.id,
      transactionFee: releaseLockTransaction.getFee(),
      redeemScriptAsHex: '',
      serializedTransactionObject: serializedTransaction
    };
  }

  private async createWallet () {
    const request = {
      method: 'createwallet',
      params: [this.walletNameToUse] // the wallet name
    };

    // Intentionally not throwing because bitcoin returns 500 when a wallet is already created
    // Logging and will fail down the line if the error causes an issue
    const isWalletRpc = false;
    try {
      await this.rpcCall(request, true, isWalletRpc);
      Logger.info(`Wallet created with name "${this.walletNameToUse}".`);
    } catch (e) {
      // using error message because bitcoin core error code is not reliable as a single code can contain multiple errors
      const duplicateCreateString = 'already exists';
      if (e.toString().toLowerCase().includes(duplicateCreateString)) {
        Logger.info(`Wallet with name ${this.walletNameToUse} already exists.`);
      } else {
        throw e;
      }
    };
  }

  private async loadWallet () {
    const request = {
      method: 'loadwallet',
      params: [this.walletNameToUse, true] // the wallet name
    };

    // Intentionally not throwing because bitcoin returns 500 when a wallet is already loaded
    // Logging and will fail down the line if the error causes an issue
    const isWalletRpc = false;
    try {
      await this.rpcCall(request, true, isWalletRpc);
      Logger.info(`Wallet loaded with name "${this.walletNameToUse}".`);
    } catch (e) {
      // using error message because bitcoin core error code is not reliable as a single code can contain multiple errors
      const duplicateLoadString = 'already loaded';
      if (e.toString().toLowerCase().includes(duplicateLoadString)) {
        Logger.info(`Wallet with name ${this.walletNameToUse} already loaded.`);
      } else {
        throw e;
      }
    };
  }

  /**
   * Gets the block data for the given block hash.
   * @param hash The hash of the block
   * @returns the block data.
   */
  public async getBlock (hash: string): Promise<BitcoinBlockModel> {
    const request = {
      method: 'getblock',
      params: [
        hash,
        2 // verbosity value to get block + transactions' info
      ]
    };

    const isWalletRpc = false;
    const block = await this.rpcCall(request, true, isWalletRpc);

    const transactionModels = block.tx.map((txn: any) => {
      const transactionBuffer = Buffer.from(txn.hex, 'hex');
      const bitcoreTransaction = BitcoinClient.createBitcoreTransactionWrapper(transactionBuffer, block.confirmations, hash);
      return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
    });

    return {
      hash: block.hash,
      height: block.height,
      previousHash: block.previousblockhash,
      transactions: transactionModels
    };
  }

  /**
   * Gets the block hash for a given block height.
   * @param height The height to get a hash for
   * @returns the block hash
   */
  public async getBlockHash (height: number): Promise<string> {
    Logger.info(`Getting hash for block ${height}`);
    const hashRequest = {
      method: 'getblockhash',
      params: [
        height // height of the block
      ]
    };

    const isWalletRpc = false;
    return this.rpcCall(hashRequest, true, isWalletRpc);
  }

  /**
   * Gets the block info for the given block height.
   * @param height The height of the block
   * @returns the block info.
   */
  public async getBlockInfoFromHeight (height: number): Promise<IBlockInfo> {
    return this.getBlockInfo(await this.getBlockHash(height));
  }

  /**
   * Gets the block info for the given block hash.
   * @param hash The hash of the block
   * @returns the block info.
   */
  public async getBlockInfo (hash: string): Promise<IBlockInfo> {
    const request = {
      method: 'getblockheader',
      params: [
        hash,
        true // verbose
      ]
    };

    const isWalletRpc = false;
    const response = await this.rpcCall(request, true, isWalletRpc);

    return {
      hash: hash,
      height: response.height,
      previousHash: response.previousblockhash
    };
  }

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  public async getCurrentBlockHeight (): Promise<number> {
    Logger.info('Getting current block height...');
    const request = {
      method: 'getblockcount'
    };

    const isWalletRpc = false;
    const response = await this.rpcCall(request, true, isWalletRpc);
    return response;
  }

  /**
   * Gets all unspent coins of the wallet which is being watched.
   * @returns the balance of the wallet
   */
  public async getBalanceInSatoshis (): Promise<number> {

    const unspentOutputs = await this.getUnspentOutputs(this.bitcoinWallet.getAddress());

    const unspentSatoshis = unspentOutputs.reduce((total, unspentOutput) => {
      return total + unspentOutput.satoshis;
    }, 0);

    return unspentSatoshis;
  }

  /**
   * Gets the transaction fee of a transaction in satoshis.
   * @param transactionId the id of the target transaction.
   * @returns the transaction fee in satoshis.
   */
  public async getTransactionFeeInSatoshis (transactionId: string): Promise<number> {

    const transaction = await this.getRawTransaction(transactionId);

    let inputSatoshiSum = 0;
    for (let i = 0; i < transaction.inputs.length; i++) {

      const currentInput = transaction.inputs[i];
      const transactionOutValue = await this.getTransactionOutValueInSatoshi(currentInput.previousTransactionId, currentInput.outputIndexInPreviousTransaction);

      inputSatoshiSum += transactionOutValue;
    }

    // transaction outputs in satoshis
    const transactionOutputs: number[] = transaction.outputs.map((output) => output.satoshis);

    const outputSatoshiSum = transactionOutputs.reduce((sum, value) => sum + value, 0);

    return (inputSatoshiSum - outputSatoshiSum);
  }

  private async addWatchOnlyAddressToWallet (publicKeyAsHex: string, rescan: boolean): Promise<void> {
    const request = {
      method: 'importpubkey',
      params: [
        publicKeyAsHex,
        'sidetree',
        rescan
      ]
    };

    const isWalletRpc = true;
    await this.rpcCall(request, false, isWalletRpc);
  }

  private async broadcastTransactionRpc (rawTransaction: string) {

    const request = {
      method: 'sendrawtransaction',
      params: [
        rawTransaction
      ]
    };

    const isWalletRpc = false;
    return this.rpcCall(request, true, isWalletRpc);
  }

  private async isAddressAddedToWallet (address: string): Promise<boolean> {
    Logger.info(`Checking if bitcoin wallet for ${address} exists`);
    const request = {
      method: 'getaddressinfo',
      params: [
        address
      ]
    };

    const isWalletRpc = true;
    const response = await this.rpcCall(request, true, isWalletRpc);
    return response.labels.length > 0 || response.iswatchonly;
  }

  private async getCurrentEstimatedFeeInSatoshisPerKB (): Promise<number> {
    const request = {
      method: 'estimatesmartfee',
      params: [
        1 // Number of confirmation targets
      ]
    };

    const isWalletRpc = false;
    const response = await this.rpcCall(request, true, isWalletRpc);

    if (!response.feerate ||
        (response.errors && response.errors.length > 0)) {
      const error = response.errors ? JSON.stringify(response.errors) : `Feerate is undefined`;
      throw new Error(`Fee rate could not be estimated. Error: ${error}`);
    }

    const feerateInBtc = response.feerate;

    return BitcoinClient.convertBtcToSatoshis(feerateInBtc);
  }

  /** Get the current estimated fee from RPC and update stored estimate */
  private async updateEstimatedFeeInSatoshisPerKB (): Promise<number> {
    let estimatedFeeSatoshiPerKB;
    try {
      estimatedFeeSatoshiPerKB = await this.getCurrentEstimatedFeeInSatoshisPerKB();
      this.estimatedFeeSatoshiPerKB = estimatedFeeSatoshiPerKB;
    } catch (error) {
      estimatedFeeSatoshiPerKB = this.estimatedFeeSatoshiPerKB;
      if (!estimatedFeeSatoshiPerKB) {
        throw error;
      }
    }
    return estimatedFeeSatoshiPerKB;
  }

  /** Get the transaction out value in satoshi, for a specified output index */
  private async getTransactionOutValueInSatoshi (transactionId: string, outputIndex: number) {
    const transaction = await this.getRawTransaction(transactionId);

    // output with the desired index
    const vout = transaction.outputs[outputIndex];

    return vout.satoshis;
  }

  /**
   * Get the raw transaction data.
   * @param transactionId The target transaction id.
   */
  public async getRawTransaction (transactionId: string): Promise<BitcoinTransactionModel> {
    const bitcoreTransaction = await this.getRawTransactionRpc(transactionId);

    return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
  }

  /**
   * Convert a block to bitcoin transaction models
   * @param block The block to convert
   */
  public static convertToBitcoinTransactionModels (block: Block): BitcoinTransactionModel[] {
    const transactionModels = block.transactions.map((transaction: any) => {
      const bitcoreTransaction = {
        id: transaction.id,
        blockHash: block.hash,
        confirmations: 1, // Unused, but need to set to a value to be able to reuse `BitcoinTransactionModel`.
        inputs: transaction.inputs,
        outputs: transaction.outputs
      };
      return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
    });

    return transactionModels;
  }

  private async getRawTransactionRpc (transactionId: string): Promise<BitcoreTransactionWrapper> {
    const request = {
      method: 'getrawtransaction',
      params: [
        transactionId,  // transaction id
        true            // verbose output
      ]
    };

    const isWalletRpc = false;
    const rawTransactionData = await this.rpcCall(request, true, isWalletRpc);
    const hexEncodedTransaction = rawTransactionData.hex;
    const transactionBuffer = Buffer.from(hexEncodedTransaction, 'hex');

    // The confirmations and the blockhash parameters can both be undefined if the transaction is not yet
    // written to the blockchain. In that case, just pass in 0 for the confirmations. With the confirmations
    // being 0, the blockhash can be understood to be undefined.
    const confirmations = rawTransactionData.confirmations ? rawTransactionData.confirmations : 0;

    return BitcoinClient.createBitcoreTransactionWrapper(transactionBuffer, confirmations, rawTransactionData.blockhash);
  }

  // This function is specifically created to help with unit testing.
  private static createTransactionFromBuffer (buffer: Buffer): Transaction {
    return new Transaction(buffer);
  }

  private static createBitcoreTransactionWrapper (buffer: Buffer, confirmations: number, blockHash: string): BitcoreTransactionWrapper {

    const transaction = BitcoinClient.createTransactionFromBuffer(buffer);

    return {
      id: transaction.id,
      blockHash: blockHash,
      confirmations: confirmations,
      inputs: transaction.inputs,
      outputs: transaction.outputs
    };
  }

  private async createTransaction (transactionData: string, minFeeInSatoshis: number): Promise<Transaction> {
    const walletAddress = this.bitcoinWallet.getAddress();
    const unspentOutputs = await this.getUnspentOutputs(walletAddress);

    const transaction = new Transaction();
    transaction.from(unspentOutputs);
    transaction.addOutput(new Transaction.Output({
      script: Script.buildDataOut(transactionData),
      satoshis: 0
    }));
    transaction.change(walletAddress);

    const estimatedFeeInSatoshis = await this.calculateTransactionFee(transaction);
    // choose the max between bitcoin estimated fee or passed in min fee to pay
    let feeToPay = Math.max(minFeeInSatoshis, estimatedFeeInSatoshis);
    // mark up the fee by specified percentage
    feeToPay += (feeToPay * this.sidetreeTransactionFeeMarkupPercentage / 100);
    // round up to the nearest integer because satoshis don't have floating points
    feeToPay = Math.ceil(feeToPay);

    transaction.fee(feeToPay);

    return transaction;
  }

  /**
   * Calculates an estimated fee for the given transaction. All the inputs and outputs MUST
   * be already set to get the estimate more accurate.
   *
   * @param transaction The transaction for which the fee is to be calculated.
   * @returns the transaction fee in satoshis.
   */
  private async calculateTransactionFee (transaction: Transaction): Promise<number> {
    // Get estimated fee from RPC
    const estimatedFeePerKB = await this.updateEstimatedFeeInSatoshisPerKB();

    // Estimate the size of the transaction
    const estimatedSizeInBytes = (transaction.inputs.length * 150) + (transaction.outputs.length * 50);
    const estimatedSizeInKB = estimatedSizeInBytes / 1000;

    const estimatedFee = estimatedSizeInKB * estimatedFeePerKB;

    // Add a percentage to the fee (trying to be on the higher end of the estimate)
    const estimatedFeeWithPercentage = estimatedFee * 1.4;

    // Make sure that there are no decimals in the fee as it is not supported
    return Math.ceil(estimatedFeeWithPercentage);
  }

  private async createFreezeTransaction (
    unspentCoins: Transaction.UnspentOutput[],
    freezeDurationInBlocks: number,
    freezeAmountInSatoshis: number): Promise<[Transaction, Script]> {

    Logger.info(`Creating a freeze transaction for amount: ${freezeAmountInSatoshis} satoshis with freeze time in blocks: ${freezeDurationInBlocks}`);

    const walletAddress = this.bitcoinWallet.getAddress();
    const freezeScript = BitcoinClient.createFreezeScript(freezeDurationInBlocks, walletAddress);
    const payToScriptHashOutput = Script.buildScriptHashOut(freezeScript);
    const payToScriptAddress = new Address(payToScriptHashOutput);

    const freezeTransaction = new Transaction()
      .from(unspentCoins)
      .to(payToScriptAddress, freezeAmountInSatoshis)
      .change(walletAddress);

    const transactionFee = await this.calculateTransactionFee(freezeTransaction);

    freezeTransaction.fee(transactionFee);

    const payToScriptAddressString = payToScriptAddress.toString();
    Logger.info(`Created freeze transaction and locked BTC at new script address '${payToScriptAddressString}' with fee of ${transactionFee}.`);

    return [freezeTransaction, freezeScript];
  }

  private async createSpendToFreezeTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeDurationInBlocks: number,
    newFreezeDurationInBlocks: number): Promise<[Transaction, Script]> {

    // eslint-disable-next-line max-len
    Logger.info(`Creating a freeze transaction with freeze time of ${newFreezeDurationInBlocks} blocks, from previously frozen transaction with id: ${previousFreezeTransaction.id}`);

    const freezeScript = BitcoinClient.createFreezeScript(newFreezeDurationInBlocks, this.bitcoinWallet.getAddress());
    const payToScriptHashOutput = Script.buildScriptHashOut(freezeScript);
    const payToScriptAddress = new Address(payToScriptHashOutput);

    // We are creating a spend transaction and are paying to another freeze script.
    // So essentially we are re-freezing ...
    const reFreezeTransaction = await this.createSpendTransactionFromFrozenTransaction(
      previousFreezeTransaction,
      previousFreezeDurationInBlocks,
      payToScriptAddress);

    const payToScriptAddressString = payToScriptAddress.toString();
    Logger.info(`Created refreeze transaction and locked BTC at new script address '${payToScriptAddressString}'.`);

    return [reFreezeTransaction, freezeScript];
  }

  private async createSpendToWalletTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeDurationInBlocks: number): Promise<Transaction> {

    // eslint-disable-next-line max-len
    Logger.info(`Creating a transaction to return (to the wallet) the previously frozen amount from transaction with id: ${previousFreezeTransaction.id} which was frozen for block duration: ${previousFreezeDurationInBlocks}`);

    return this.createSpendTransactionFromFrozenTransaction(
      previousFreezeTransaction,
      previousFreezeDurationInBlocks,
      this.bitcoinWallet.getAddress());
  }

  /**
   * Creates a spend transaction to spend the previously frozen output. The details
   * on how to create a spend transactions were taken from the BIP65 demo at:
   * https://github.com/mruddy/bip65-demos/blob/master/freeze.js.
   *
   * @param previousFreezeTransaction The previously frozen transaction.
   * @param previousFreezeDurationInBlocks The previously frozen transaction's freeze time in blocks.
   * @param paytoAddress The address where the spend transaction should go to.
   */
  private async createSpendTransactionFromFrozenTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeDurationInBlocks: number,
    paytoAddress: Address): Promise<Transaction> {

    // First create an input from the previous frozen transaction output. Note that we update
    // this input later to add the relevant information required for a pay-to-script-hash output.
    const frozenOutputAsInput = this.createUnspentOutputFromFrozenTransaction(previousFreezeTransaction, previousFreezeDurationInBlocks);
    const previousFreezeAmountInSatoshis = frozenOutputAsInput.satoshis;

    // Now create a spend transaction using the frozen output. Create the transaction with all
    // inputs and outputs as they are needed to calculate the fee.
    const spendTransaction = new Transaction()
      .from([frozenOutputAsInput])
      .to(paytoAddress, previousFreezeAmountInSatoshis);

    // The check-sequence-verify lock requires transaction version 2
    (spendTransaction as any).version = 2;

    // When spending from freeze, we need to set the sequence number of the input correctly.
    // See the bitcoin documentation on relative-lock and the sequence number for more info:
    //   relative lock: https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki
    //   sequence number: https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki
    (spendTransaction.inputs[0] as any).sequenceNumber = previousFreezeDurationInBlocks;

    const transactionFee = await this.calculateTransactionFee(spendTransaction);

    // We need to set the transaction fee and subtract that fee from the freeze amount.
    // We cannot just update the existing output (it's readonly), so we need to first remove it,
    // and add another one with the correct amount.
    spendTransaction.outputs.shift();
    spendTransaction.to(paytoAddress, previousFreezeAmountInSatoshis - transactionFee)
      .fee(transactionFee);

    return spendTransaction;
  }

  private createUnspentOutputFromFrozenTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousfreezeDurationInBlocks: number): Transaction.UnspentOutput {

    const previousFreezeAmountInSatoshis = previousFreezeTransaction.outputs[0].satoshis;
    const previousFreezeRedeemScript = BitcoinClient.createFreezeScript(previousfreezeDurationInBlocks, this.bitcoinWallet.getAddress());
    const scriptPubKey = Script.buildScriptHashOut(previousFreezeRedeemScript);

    // This output mimics the transaction output and that is why it has inputs such as
    // txid, vout, scriptPubKey etc ...
    const frozenOutputAsUnspentOutput = Transaction.UnspentOutput.fromObject({
      txid: previousFreezeTransaction.id,
      vout: 0,
      scriptPubKey: scriptPubKey,
      satoshis: previousFreezeAmountInSatoshis
    });

    return frozenOutputAsUnspentOutput;
  }

  private static createFreezeScript (freezeDurationInBlocks: number, walletAddress: Address): Script {
    const lockBuffer = (crypto.BN as any).fromNumber(freezeDurationInBlocks).toScriptNumBuffer();
    const publicKeyHashOut = Script.buildPublicKeyHashOut(walletAddress);

    const redeemScript = Script.empty()
      .add(lockBuffer)
      .add(178) // OP_CSV (https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki)
      .add(117) // OP_DROP
      .add(publicKeyHashOut);

    return redeemScript;
  }

  private static serializeSignedTransaction (signedTransaction: Transaction): string {
    // The signed transaction is returned by the IBitcoinWallet implementation and could be created via serialized hex
    // input. In that case, the bitcore-lib Transaction does not distinguish the inputs and serialization fails with an
    // "unsigned-inputs" failure. So for serialization, we will pass in special options to disable those checks.
    return (signedTransaction as any).serialize({ disableAll: true });
  }

  private static createBitcoinInputModel (bitcoreInput: Transaction.Input): BitcoinInputModel {
    return {
      previousTransactionId: bitcoreInput.prevTxId.toString('hex'),
      outputIndexInPreviousTransaction: bitcoreInput.outputIndex,
      scriptAsmAsString: bitcoreInput.script ? bitcoreInput.script.toASM() : ''
    };
  }

  private static createBitcoinOutputModel (bitcoreOutput: Transaction.Output): BitcoinOutputModel {
    return {
      satoshis: bitcoreOutput.satoshis,
      // Some transaction outputs do not have a script, such as coinbase transactions.
      scriptAsmAsString: bitcoreOutput.script ? bitcoreOutput.script.toASM() : ''
    };
  }

  /**
   * create internal bitcoin transaction model from bitcore transaction model
   * @param transactionWrapper the bitcore transaction model wrapper
   */
  private static createBitcoinTransactionModel (transactionWrapper: BitcoreTransactionWrapper): BitcoinTransactionModel {

    const bitcoinInputs = transactionWrapper.inputs.map((input) => { return BitcoinClient.createBitcoinInputModel(input); });
    const bitcoinOutputs = transactionWrapper.outputs.map((output) => { return BitcoinClient.createBitcoinOutputModel(output); });

    return {
      inputs: bitcoinInputs,
      outputs: bitcoinOutputs,
      id: transactionWrapper.id,
      blockHash: transactionWrapper.blockHash,
      confirmations: transactionWrapper.confirmations
    };
  }

  private async getUnspentOutputs (address: Address): Promise<Transaction.UnspentOutput[]> {

    const addressToSearch = address.toString();
    Logger.info(`Getting unspent coins for ${addressToSearch}`);

    // We are setting minimum required confirmations when fetching unspent transactions to 0
    // so that transaction(s) waiting to be confirmed are included. This allows:
    // 1. Accurate calculation of wallet balance (otherwise no transaction returned by the `listunspent` call yields balance of 0).
    // 2. Both lock monitor and core to write a transaction using the UTXO in the unconfirmed transaction generated by each other.
    const request = {
      method: 'listunspent',
      params: [
        0, // Minimum required confirmation.
        null,
        [addressToSearch]
      ]
    };
    const isWalletRpc = true;
    const response: Array<any> = await this.rpcCall(request, true, isWalletRpc);

    const unspentTransactions = response.map((coin) => {
      return new Transaction.UnspentOutput(coin);
    });

    Logger.info(`Returning ${unspentTransactions.length} coins`);

    return unspentTransactions;
  }

  /**
   *
   * @param request The request for the rpc call
   * @param timeout Should timeout or not
   * @param isWalletRpc Is wallet rpc or not. Should pass in true if the rpc call is called on specific wallet
   */
  private async rpcCall (request: any, timeout: boolean, isWalletRpc: boolean): Promise<any> {
    // append some standard jrpc parameters
    request.jsonrpc = '1.0';
    request.id = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(32);

    const requestString = JSON.stringify(request);
    Logger.info(`Sending jRPC request: id: ${request.id}, method: ${request.method}`);

    const requestOptions: RequestInit = {
      body: requestString,
      method: 'post'
    };

    if (this.bitcoinAuthorization) {
      requestOptions.headers = {
        Authorization: `Basic ${this.bitcoinAuthorization}`
      };
    }

    // Specify the wallet to use if it is a wallet rpc call
    // List of rpc calls categorized by type: https://developer.bitcoin.org/reference/rpc/
    const rpcUrl = isWalletRpc ? `${this.bitcoinPeerUri}/wallet/${this.walletNameToUse}` : this.bitcoinPeerUri;

    const bodyBuffer = await this.fetchWithRetry(rpcUrl, requestOptions, timeout);

    const responseJson = JSON.parse(bodyBuffer.toString());

    if ('error' in responseJson && responseJson.error !== null) {
      const error = new Error(`RPC failed: ${JSON.stringify(responseJson.error)}`);
      Logger.error(error);
      throw error;
    }

    return responseJson.result;
  }

  /**
   * Calls `nodeFetch` and retries upon request time-out or HTTP 502/503/504 codes.
   * @param uri URI to fetch
   * @param requestParameters Request parameters to use
   * @param enableTimeout Set to `true` to have request timeout with exponential increase on timeout in subsequent retries.
   *                      Set to `false` to wait indefinitely for response (used for long running request such as importing a wallet).
   * @returns Buffer of the response body.
   */
  private async fetchWithRetry (uri: string, requestParameters: RequestInit, enableTimeout: boolean): Promise<Buffer> {
    let retryCount = 0;
    let networkError: Error | undefined;
    let requestTimeout = enableTimeout ? this.requestTimeout : 0; // 0 = disabling timeout.
    do {
      // If we are retrying (not initial attempt).
      if (networkError !== undefined) {
        retryCount++;

        // Double the request timeout. NOTE: if timeout is disabled, then `requestTimeout` will always be 0;
        requestTimeout *= 2;

        Logger.info(`Retrying attempt count: ${retryCount} with request timeout of ${requestTimeout} ms...`);
      }

      let response: Response;
      try {
        // Clone the request parameters passed in, then set timeout value if needed.
        const params = Object.assign({}, requestParameters);
        params.timeout = requestTimeout;

        response = await nodeFetch(uri, params);
      } catch (error) {
        // Retry-able if request is timed out.
        if (error instanceof FetchError && error.type === 'request-timeout') {
          networkError = error;
          Logger.info(`Attempt ${retryCount} timed-out.`);
          continue;
        }

        throw error;
      }

      const bodyBuffer = await ReadableStream.readAll(response.body);
      if (response.status === httpStatus.OK) {
        return bodyBuffer;
      } else {
        networkError = new SidetreeError(
          ErrorCode.BitcoinClientFetchHttpCodeWithNetworkIssue,
          `Network issue with HTTP response: [${response.status}]: ${bodyBuffer}`
        );

        // Retry-able if one of these HTTP codes.
        if (response.status === httpStatus.BAD_GATEWAY ||
            response.status === httpStatus.GATEWAY_TIMEOUT ||
            response.status === httpStatus.SERVICE_UNAVAILABLE) {
          Logger.info(`Attempt ${retryCount} resulted in ${response.status}`);
          continue;
        }

        // All other error code, not connectivity related issue, fail straight away.
        throw new SidetreeError(
          ErrorCode.BitcoinClientFetchUnexpectedError,
          `Unexpected fetch HTTP response: [${response.status}]: ${bodyBuffer}`
        );
      }

      // Else we can retry
    } while (retryCount < this.requestMaxRetries);

    Logger.info('Max retries reached without success.');
    throw networkError;
  }
}
