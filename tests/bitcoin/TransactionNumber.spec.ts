import ErrorCode from '../../lib/bitcoin/ErrorCode';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';

describe('TransactionNumber', () => {
  describe('construct()', () => {
    it('should construct transaction number correctly.', async () => {
      const transactionNumber = TransactionNumber.construct(123456789, 777);
      expect(transactionNumber).toEqual(123456789000777);
    });

    it('should throw error if block number exceeded max value.', async () => {
      expect(() => TransactionNumber.construct(9000000001, 123456)).toThrow(jasmine.objectContaining({
        code: ErrorCode.TransactionNumberBlockNumberTooLarge
      }));
    });

    it('should throw error if transaction index in block exceeded max value.', async () => {
      expect(() => TransactionNumber.construct(123456789, 1000000)).toThrow(jasmine.objectContaining({
        code: ErrorCode.TransactionNumberTransactionIndexInBlockTooLarge
      }));
    });
  });

  describe('lastTransactionOfBlock()', () => {
    it('should return the transaction number of the last possible transaction in the given block.', async () => {
      const transactionNumber = TransactionNumber.lastTransactionOfBlock(11111111);
      expect(transactionNumber).toEqual(11111111999999);
    });
  });

  describe('getBlockNumber()', () => {
    it('should return the block number given a transaction number.', async () => {
      const blockNumber = TransactionNumber.getBlockNumber(11111111000000);
      expect(blockNumber).toEqual(11111111);
    });
  });
});
