/**
 * Defines the TransactionNumber as a combination of blockNumber and position within the block
 */
export default class TransactionNumber {

  private bitWidth: number;

  /**
   * datatype to store the transaction number
   */
  public transactionNumber: number;

  /* We assume blockNumber and position to be 32 bits each */
  public constructor (blockNumber: number, position: number) {
    this.bitWidth = 32;
    this.transactionNumber =
      blockNumber * (2 ** this.bitWidth)
      + position;
  }

  /**
   * Sets the transaction number
   */
  public setTransactionNumber (transactionNumber: number) {
    this.transactionNumber = transactionNumber;
  }

  /**
   * Returns the transaction number
   */
  public getTransactionNumber () {
    return this.transactionNumber;
  }

  /**
   * Returns the block number component of transactionNumber
   */
  public getBlockNumber () {
    let blockNumber = Math.floor(this.transactionNumber / (2 ** this.bitWidth));
    return blockNumber;
  }

  /**
   * Returns the position component of transactionNumber
   */
  public getPosition () {
    let mask = 2 ** this.bitWidth - 1;
    return (this.transactionNumber & mask);
  }
}
