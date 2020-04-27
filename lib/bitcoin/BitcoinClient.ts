import * as httpStatus from 'http-status';
import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinSidetreeTransactionModel from './models/BitcoinSidetreeTransactionModel';
import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinLockTransactionModel from './models/BitcoinLockTransactionModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import BitcoinWallet from './BitcoinWallet';
import IBitcoinWallet from './interfaces/IBitcoinWallet';
import nodeFetch, { FetchError, Response, RequestInit } from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import { Address, crypto, Networks, PrivateKey, Script, Transaction, Unit } from 'bitcore-lib';
import { IBlockInfo } from './BitcoinProcessor';

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

  constructor (
    private bitcoinPeerUri: string,
    bitcoinRpcUsername: string | undefined,
    bitcoinRpcPassword: string | undefined,
    bitcoinWalletOrImportString: IBitcoinWallet | string,
    private requestTimeout: number,
    private requestMaxRetries: number,
    private sidetreeTransactionFeeMarkupPercentage: number) {

    if (typeof bitcoinWalletOrImportString === 'string') {
      console.info('Creating bitcoin wallet using the import string passed in.');
      this.bitcoinWallet = new BitcoinWallet(bitcoinWalletOrImportString);
    } else {
      console.info(`Using the bitcoin wallet passed in.`);
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

    const walletAddress = this.bitcoinWallet.getAddress();

    console.debug(`Checking if bitcoin contains a wallet for ${walletAddress}`);
    if (!await this.isAddressAddedToWallet(walletAddress.toString())) {
      console.debug(`Configuring bitcoin peer to watch address ${walletAddress}. This can take up to 10 minutes.`);

      const publicKeyAsHex = this.bitcoinWallet.getPublicKeyAsHex();
      await this.addWatchOnlyAddressToWallet(publicKeyAsHex, true);
    } else {
      console.debug('Wallet found.');
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
    const transactionHash = this.broadcastTransactionRpc(bitcoinLockTransaction.serializedTransactionObject);
    console.info(`Broadcasted lock transaction: ${transactionHash}`);

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

    return {
      transactionId: transaction.id,
      transactionFee: transaction.getFee(),
      serializedTransactionObject: transaction.serialize()
    };
  }

  /**
   * Creates (and NOT broadcasts) a lock transaction using the funds from the linked wallet.
   *
   * NOTE: if the linked wallet outputs are spent then this transaction cannot be broadcasted. So broadcast
   * this transaction before spending from the wallet.
   *
   * @param lockAmountInSatoshis The amount to lock.
   * @param lockUntilBlock  The block until the amount to lock to; the amount becomes spendable AT this block.
   */
  public async createLockTransaction (lockAmountInSatoshis: number, lockUntilBlock: number): Promise<BitcoinLockTransactionModel> {
    const unspentCoins = await this.getUnspentOutputs(this.bitcoinWallet.getAddress());

    const [freezeTransaction, redeemScriptAsHex] = await this.createFreezeTransaction(unspentCoins, lockUntilBlock, lockAmountInSatoshis);

    return {
      transactionId: freezeTransaction.id,
      transactionFee: freezeTransaction.getFee(),
      redeemScriptAsHex: redeemScriptAsHex,
      serializedTransactionObject: freezeTransaction.serialize()
    };
  }

  /**
   * Creates (and NOT broadcasts) a lock transaction using the funds from the previously locked transaction.
   *
   * @param existingLockTransactionId The existing transaction with locked output.
   * @param existingLockUntilBlock The block when the output becomes spendable.
   * @param newLockUntilBlock The new target block for locking (the amount becomes spendable at this block).
   */
  public async createRelockTransaction (
    existingLockTransactionId: string,
    existingLockUntilBlock: number,
    newLockUntilBlock: number): Promise<BitcoinLockTransactionModel> {

    const existingLockTransaction = await this.getRawTransactionRpc(existingLockTransactionId);

    const [freezeTransaction, redeemScriptAsHex] =
      await this.createSpendToFreezeTransaction(existingLockTransaction, existingLockUntilBlock, newLockUntilBlock);

    const serializedTransaction = BitcoinClient.serializeSpendTransaction(freezeTransaction);

    return {
      transactionId: freezeTransaction.id,
      transactionFee: freezeTransaction.getFee(),
      redeemScriptAsHex: redeemScriptAsHex,
      serializedTransactionObject: serializedTransaction
    };
  }

  /**
   * Creates (and NOT broadcasts) a transaction which outputs the previously locked amount into the linked
   * wallet.
   *
   * @param existingLockTransactionId The existing transaction with locked amount.
   * @param existingLockUntilBlock The block when the amount becomes spendable.
   */
  public async createReleaseLockTransaction (existingLockTransactionId: string, existingLockUntilBlock: number): Promise<BitcoinLockTransactionModel> {
    const existingLockTransaction = await this.getRawTransactionRpc(existingLockTransactionId);

    const releaseLockTransaction = await this.createSpendToWalletTransaction(existingLockTransaction, existingLockUntilBlock);

    const serializedTransaction = BitcoinClient.serializeSpendTransaction(releaseLockTransaction);

    return {
      transactionId: releaseLockTransaction.id,
      transactionFee: releaseLockTransaction.getFee(),
      redeemScriptAsHex: '',
      serializedTransactionObject: serializedTransaction
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

    const block = await this.rpcCall(request, true);

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
    console.info(`Getting hash for block ${height}`);
    const hashRequest = {
      method: 'getblockhash',
      params: [
        height // height of the block
      ]
    };

    return this.rpcCall(hashRequest, true);
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

    const response = await this.rpcCall(request, true);

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
    console.info('Getting current block height...');
    const request = {
      method: 'getblockcount'
    };

    const response = await this.rpcCall(request, true);
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
   * @returns the transaction fee.
   */
  public async getTransactionFeeInSatoshis (transactionId: string): Promise<number> {

    const transaction = await this.getRawTransaction(transactionId);

    let inputSatoshiSum = 0;
    for (let i = 0 ; i < transaction.inputs.length ; i++) {

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

    await this.rpcCall(request, false);
  }

  private async broadcastTransactionRpc (rawTransaction: string) {

    const request = {
      method: 'sendrawtransaction',
      params: [
        rawTransaction
      ]
    };

    return this.rpcCall(request, true);
  }

  private async isAddressAddedToWallet (address: string): Promise<boolean> {
    console.info(`Checking if bitcoin wallet for ${address} exists`);
    const request = {
      method: 'getaddressinfo',
      params: [
        address
      ]
    };

    const response = await this.rpcCall(request, true);
    return response.labels.length > 0 || response.iswatchonly;
  }

  private async getCurrentEstimatedFeeInSatoshisPerKb (): Promise<number> {
    const request = {
      method: 'estimatesmartfee',
      params: [
        1 // Number of confirmation targtes
      ]
    };

    const response = await this.rpcCall(request, true);

    if (!response.feerate ||
        (response.errors && response.errors.length > 0)) {
      const error = response.errors ? JSON.stringify(response.errors) : `Feerate is undefined`;
      throw new Error(`Fee rate could not be estimated. Error: ${error}`);
    }

    const feerateInBtc = response.feerate;

    return BitcoinClient.convertBtcToSatoshis(feerateInBtc);
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

  private async getRawTransactionRpc (transactionId: string): Promise<BitcoreTransactionWrapper> {
    const request = {
      method: 'getrawtransaction',
      params: [
        transactionId,  // transaction id
        true            // verbose output
      ]
    };

    const rawTransactionData = await this.rpcCall(request, true);
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
    await this.bitcoinWallet.signTransaction(transaction);

    return transaction;
  }

  /**
   * Calculates an estimated fee for the given transaction. All the inputs and outputs MUST
   * be already set to get the estimate more accurate.
   *
   * @param transaction The transaction for which the fee is to be calculated.
   */
  private async calculateTransactionFee (transaction: Transaction): Promise<number> {
    // Get esimtated fee from RPC
    const estimatedFeeInKb = await this.getCurrentEstimatedFeeInSatoshisPerKb();

    // Estimate the size of the transaction
    const estimatedSizeInBytes = (transaction.inputs.length * 150) + (transaction.outputs.length * 50);
    const estimatedSizeInKb = estimatedSizeInBytes / 1000;

    const estimatedFee = estimatedSizeInKb * estimatedFeeInKb;

    // Add a percentage to the fee (trying to be on the higher end of the estimate)
    return estimatedFee + (estimatedFee * .4);
  }

  private async createFreezeTransaction (
    unspentCoins: Transaction.UnspentOutput[],
    freezeUntilBlock: number,
    freezeAmountInSatoshis: number): Promise<[Transaction, string]> {

    console.info(`Creating a freeze transaction for amount: ${freezeAmountInSatoshis} satoshis with freeze until block: ${freezeUntilBlock}`);

    const walletAddress = this.bitcoinWallet.getAddress();
    const freezeScript = BitcoinClient.createFreezeScript(freezeUntilBlock, walletAddress);
    const payToScriptHashOutput = Script.buildScriptHashOut(freezeScript);
    const payToScriptAddress = new Address(payToScriptHashOutput);

    const freezeTransaction = new Transaction()
                              .from(unspentCoins)
                              .to(payToScriptAddress, freezeAmountInSatoshis)
                              .change(walletAddress);

    const transactionFee = await this.calculateTransactionFee(freezeTransaction);

    freezeTransaction.fee(transactionFee);
    await this.bitcoinWallet.signTransaction(freezeTransaction);

    return [freezeTransaction, freezeScript.toHex()];
  }

  private async createSpendToFreezeTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeUntilBlock: number,
    freezeUntilBlock: number): Promise<[Transaction, string]> {

    // tslint:disable-next-line: max-line-length
    console.info(`Creating a freeze transaction with freeze until block: ${freezeUntilBlock} from previously frozen transaction with id: ${previousFreezeTransaction.id}`);

    const freezeScript = BitcoinClient.createFreezeScript(freezeUntilBlock, this.bitcoinWallet.getAddress());
    const payToScriptHashOutput = Script.buildScriptHashOut(freezeScript);
    const payToScriptAddress = new Address(payToScriptHashOutput);

    // We are creating a spend transaction and are paying to another freeze script.
    // So essentially we are re-freezing ...
    const reFreezeTransaction = await this.createSpendTransactionFromFrozenTransaction(
      previousFreezeTransaction,
      previousFreezeUntilBlock,
      payToScriptAddress);

    return [reFreezeTransaction, freezeScript.toHex()];
  }

  private async createSpendToWalletTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeUntilBlock: number): Promise<Transaction> {

    // tslint:disable-next-line: max-line-length
    console.info(`Creating a transaction to return (to the wallet) the preivously frozen amount from transaction with id: ${previousFreezeTransaction.id} which was frozen until block: ${previousFreezeUntilBlock}`);

    return this.createSpendTransactionFromFrozenTransaction(
      previousFreezeTransaction,
      previousFreezeUntilBlock,
      this.bitcoinWallet.getAddress());
  }

  /**
   * Creates a spend transaction to spend the previously frozen output. The details
   * on how to create a spend transactions were taken from the BIP65 demo at:
   * https://github.com/mruddy/bip65-demos/blob/master/freeze.js.
   *
   * @param previousFreezeTransaction The previously frozen transaction.
   * @param previousFreezeUntilBlock The previously frozen transaction's freeze until block.
   * @param paytoAddress The address where the spend transaction should go to.
   */
  private async createSpendTransactionFromFrozenTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeUntilBlock: number,
    paytoAddress: Address): Promise<Transaction> {

    // First create an input from the previous frozen transaction output. Note that we update
    // this input later to add the relevant information required for a pay-to-script-hash output.
    const frozenOutputAsInput = this.createUnspentOutputFromFrozenTransaction(previousFreezeTransaction, previousFreezeUntilBlock);
    const previousFreezeAmountInSatoshis = frozenOutputAsInput.satoshis;

    // Now create a spend transaction using the frozen output. Create the transaction with all
    // inputs and outputs as they are needed to calculate the fee.
    const spendTransaction = new Transaction()
                                   .from([frozenOutputAsInput])
                                   .to(paytoAddress, previousFreezeAmountInSatoshis)
                                   .lockUntilBlockHeight(previousFreezeUntilBlock); // Transaction remains in mempool until specified block height.

    const transactionFee = await this.calculateTransactionFee(spendTransaction);

    // We need to set the transaction fee and subtract that fee from the freeze amount.
    // We cannot just update the existing output (it's readonly), so we need to first remove it,
    // and add another one with the correct amount.
    spendTransaction.outputs.shift();
    spendTransaction.to(paytoAddress, previousFreezeAmountInSatoshis - transactionFee)
                    .fee(transactionFee);

    // Now sign the transaction
    const previousFreezeScript = BitcoinClient.createFreezeScript(previousFreezeUntilBlock, this.bitcoinWallet.getAddress());
    await this.bitcoinWallet.signSpendFromFreezeTransaction(spendTransaction, previousFreezeScript);

    return spendTransaction;
  }

  private createUnspentOutputFromFrozenTransaction (
    previousFreezeTransaction: BitcoreTransactionWrapper,
    previousFreezeUntilBlock: number): Transaction.UnspentOutput {

    const previousFreezeAmountInSatoshis = previousFreezeTransaction.outputs[0].satoshis;
    const previousFreezeRedeemScript = BitcoinClient.createFreezeScript(previousFreezeUntilBlock, this.bitcoinWallet.getAddress());
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

  private static createFreezeScript (freezeUntilBlock: number, walletAddress: Address): Script {
    const lockBuffer = (crypto.BN as any).fromNumber(freezeUntilBlock).toScriptNumBuffer();
    const publicKeyHashOut = Script.buildPublicKeyHashOut(walletAddress);

    const redeemScript = Script.empty()
                         .add(lockBuffer)
                         .add(177) // OP_CLTV
                         .add(117) // OP_DROP
                         .add(publicKeyHashOut);

    return redeemScript;
  }

  private static serializeSpendTransaction (spendTransaction: Transaction): string {
    // bitcore-lib does not support creating the spendFromFreeze transactions natively so we have to manually modify the
    // inputs to add signatures/scripts etc. This means that when we try to serialize, the bitcore-lib throws
    // as it is unable to verify the signatures. So for serialization, we will pass in special options to
    // disable those checks.
    return (spendTransaction as any).serialize({ disableIsFullySigned: true });
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
      scriptAsmAsString: bitcoreOutput.script ? bitcoreOutput.script.toASM() : ''
    };
  }

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

    // Retrieve all transactions by addressToSearch via BCoin Node API /tx/address/$address endpoint
    const addressToSearch = address.toString();
    console.info(`Getting unspent coins for ${addressToSearch}`);
    const request = {
      method: 'listunspent',
      params: [
        null,
        null,
        [addressToSearch]
      ]
    };
    const response: Array<any> = await this.rpcCall(request, true);

    const unspentTransactions = response.map((coin) => {
      return new Transaction.UnspentOutput(coin);
    });

    console.info(`Returning ${unspentTransactions.length} coins`);

    return unspentTransactions;
  }

  private async rpcCall (request: any, timeout: boolean): Promise<any> {
    // append some standard jrpc parameters
    request['jsonrpc'] = '1.0';
    request['id'] = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(32);

    const requestString = JSON.stringify(request);
    console.debug(`Sending jRPC request: id: ${request.id}, method: ${request['method']}`);

    const requestOptions: RequestInit = {
      body: requestString,
      method: 'post'
    };

    if (this.bitcoinAuthorization) {
      requestOptions.headers = {
        Authorization: `Basic ${this.bitcoinAuthorization}`
      };
    }

    const response = await this.fetchWithRetry(this.bitcoinPeerUri.toString(), requestOptions, timeout);

    const responseData = await ReadableStream.readAll(response.body);
    if (response.status !== httpStatus.OK) {
      const error = new Error(`Fetch failed [${response.status}]: ${responseData}`);
      console.error(error);
      throw error;
    }

    const responseJson = JSON.parse(responseData.toString());

    if ('error' in responseJson && responseJson.error !== null) {
      const error = new Error(`RPC failed: ${JSON.stringify(responseJson.error)}`);
      console.error(error);
      throw error;
    }

    return responseJson.result;
  }

  /**
   * Calls `nodeFetch` and retries with exponential back-off on `request-timeout` FetchError`.
   * @param uri URI to fetch
   * @param requestParameters Request parameters to use
   * @param setTimeout True to set a timeout on the request, and retry if times out, false to wait indefinitely.
   * @returns Response of the fetch
   */
  private async fetchWithRetry (uri: string, requestParameters?: RequestInit | undefined, setTimeout: boolean = true): Promise<Response> {
    let retryCount = 0;
    let timeout: number;
    do {
      timeout = this.requestTimeout * 2 ** retryCount;
      let params = Object.assign({}, requestParameters);
      if (setTimeout) {
        params = Object.assign(params, {
          timeout
        });
      }
      try {
        return await nodeFetch(uri, params);
      } catch (error) {
        if (error instanceof FetchError) {
          if (retryCount >= this.requestMaxRetries) {
            console.debug('Max retries reached. Request failed.');
            throw error;
          }
          switch (error.type) {
            case 'request-timeout':
              console.debug(`Request timeout (${retryCount})`);
              await this.waitFor(Math.round(timeout));
              console.debug(`Retrying request (${++retryCount})`);
              continue;
          }
        }
        console.error(error);
        throw error;
      }
    } while (true);
  }

  /**
   * Async timeout
   * @param milliseconds Timeout in milliseconds
   */
  private async waitFor (milliseconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
