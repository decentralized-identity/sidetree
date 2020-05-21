import BitcoinBlockModel from '../models/BitcoinBlockModel';
import BitcoinClient from '../BitcoinClient';
import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import ProtocolParameters from '../ProtocolParameters';
import ReservoirSampler from './ReservoirSampler';
import SidetreeTransactionParser from '../SidetreeTransactionParser';
import SlidingWindowQuantileCalculator from './SlidingWindowQuantileCalculator';
import TransactionNumber from '../TransactionNumber';

/**
 * Encapsulates the functionality for calculating the normalized fees for blocks.
 */
export default class NormalizedFeeCalculator {

  /** proof of fee configuration */
  private readonly quantileCalculator: SlidingWindowQuantileCalculator;

  private readonly transactionSampler: ReservoirSampler;

  public constructor (
    genesisBlockNumber: number,
    private mongoQuantileStore: ISlidingWindowQuantileStore,
    private bitcoinClient: BitcoinClient,
    private sidetreeTransactionParser: SidetreeTransactionParser) {

    this.quantileCalculator = new SlidingWindowQuantileCalculator(
      BitcoinClient.convertBtcToSatoshis(1),
      ProtocolParameters.windowSizeInGroups,
      ProtocolParameters.quantileMeasure,
      ProtocolParameters.maxQuantileDeviationPercentage,
      genesisBlockNumber,
      this.mongoQuantileStore);

    this.transactionSampler = new ReservoirSampler(ProtocolParameters.sampleSizePerGroup);
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize () {
    await this.quantileCalculator.initialize();
  }

  /**
   * Return proof-of-fee value for a particular block.
   *
   * @returns The fee if already found and calculated; undeinfed otherwise.
   */
  public getNormalizedFee (block: number): number | undefined {

    const blockAfterHistoryOffset = Math.max(block - ProtocolParameters.historicalOffsetInBlocks, 0);
    const groupId = this.getGroupIdFromBlock(blockAfterHistoryOffset);
    return this.quantileCalculator.getQuantile(groupId);
  }

  /**
   * Returns the first transaction number of given blockNumber's group.
   * @param blockNumber The target block number.
   */
  public getFirstTransactionOfGroup (blockNumber: number): number {
    const firstBlockInGroup = this.getFirstBlockInGroup(blockNumber);

    return TransactionNumber.construct(firstBlockInGroup, 0);
  }

  /**
   * Trims entries from the system DBs to the closest full fee sampling group boundary.
   * @param lastValidBlockNumber The last known valid block number.
   * @returns The last block of the fee sampling group.
   */
  public async trimDatabasesToGroupBoundary (lastValidBlockNumber: number): Promise<void> {

    console.info(`Reverting quantile DB to the closest fee sampling group boundary given block: ${lastValidBlockNumber}`);

    // For the quantile DB, we need to remove the full group (corresponding to the given
    // lastValidBlockNumber). This is because currently there is no way to add/remove individual block's
    // data to the quantile DB ... it only expects to work with the full groups. Which means that we
    // need to remove all the transactions which belong to that group (and later ones).
    //
    // So what we need to do is:
    // <code>
    //   validBlockGroup = findGroupForTheBlock(lastValidBlockNumber);
    //   deleteAllGroupsGreaterThanOrEqualTo(validBlockGroup);
    // </code>
    const revertToGroupId = this.getGroupIdFromBlock(lastValidBlockNumber);

    // Now revert the corresponding groups (and later) from the quantile calculator.
    console.debug(`Removing the quantile data greater and equal than: ${revertToGroupId}`);
    await this.quantileCalculator.removeGroupsGreaterThanOrEqual(revertToGroupId);

    // Reset transaction sampling
    this.transactionSampler.clear();
  }

  /**
   * Process the transactions in the given block for the normalized fee calculations.
   * @param blockData The block to process.
   */
  public async processBlock (blockData: BitcoinBlockModel): Promise<void> {
    const blockHeight = blockData.height;
    const blockHash = blockData.hash;

    // reseed source of psuedo-randomness to the blockhash
    this.transactionSampler.resetPsuedoRandomSeed(blockHash);

    const transactions = blockData.transactions;

    // First transaction in a block is always the coinbase (miner's) transaction and has no inputs
    // so we are going to ignore that transaction in our calculations.
    for (let transactionIndex = 1; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      const sidetreeData = await this.sidetreeTransactionParser.parse(transaction);
      const isSidetreeTransaction = sidetreeData !== undefined;

      // Add the transaction to the sampler.  We filter out transactions with unusual
      // input count - such transaction require a large number of rpc calls to compute transaction fee
      // not worth the cost for an approximate measure. We also filter out sidetree transactions
      const inputsCount = transaction.inputs.length;

      if (!isSidetreeTransaction &&
          inputsCount <= ProtocolParameters.maxInputCountForSampledTransaction) {
        this.transactionSampler.addElement(transaction.id);
      }
    }

    if (this.isGroupBoundary(blockHeight)) {

      // Compute the transaction fees for sampled transactions of this group
      const sampledTransactionIds = this.transactionSampler.getSample();
      const sampledTransactionFees = new Array();
      for (let transactionId of sampledTransactionIds) {
        const transactionFee = await this.bitcoinClient.getTransactionFeeInSatoshis(transactionId);
        sampledTransactionFees.push(transactionFee);
      }

      const groupId = this.getGroupIdFromBlock(blockHeight);
      await this.quantileCalculator.add(groupId, sampledTransactionFees);

      // Reset the sampler for the next group
      this.transactionSampler.clear();
    }
  }

  /**
   * For proof of fee calculation, blocks are grouped into fixed sized groups.
   * This function rounds a block to the first block in its group and returns that
   * value.
   * @param block The target block
   */
  private getFirstBlockInGroup (block: number): number {
    const groupId = this.getGroupIdFromBlock(block);
    return groupId * ProtocolParameters.groupSizeInBlocks;
  }

  private isGroupBoundary (block: number): boolean {
    return (block + 1) % ProtocolParameters.groupSizeInBlocks === 0;
  }

  private getGroupIdFromBlock (block: number): number {
    return Math.floor(block / ProtocolParameters.groupSizeInBlocks);
  }
}
