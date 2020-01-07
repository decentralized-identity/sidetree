import OperationRateLimiter from '../../lib/core/versions/latest/OperationRateLimiter';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';

describe('OperationRateLimiter', () => {
  let operationRateLimiter: OperationRateLimiter;
  beforeEach(() => {
    operationRateLimiter = new OperationRateLimiter(25);
  });

  describe('getHighestFeeTransactionsFromCurrentTransactionTime', () => {
    it('should return the correct list of transactions in the expected order', () => {
      const transactionModel1 = {
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash',
          numberOfOperations: 12
        }),
        transactionFeePaid: 333,
        normalizedTransactionFee: 1
      };

      const transactionModel2 = {
        transactionNumber: 2,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash2',
          numberOfOperations: 11
        }),
        transactionFeePaid: 999,
        normalizedTransactionFee: 1
      };

      const transactionModel3 = {
        transactionNumber: 3,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash3',
          numberOfOperations: 8
        }),
        transactionFeePaid: 998,
        normalizedTransactionFee: 1
      };

      const transactionModel4 = {
        transactionNumber: 4,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash4',
          numberOfOperations: 1
        }),
        transactionFeePaid: 14,
        normalizedTransactionFee: 1
      };

      operationRateLimiter['currentTransactionTime'] = 12345;
      operationRateLimiter['transactionsInCurrentTransactionTime'].push(transactionModel1);
      operationRateLimiter['transactionsInCurrentTransactionTime'].push(transactionModel2);
      operationRateLimiter['transactionsInCurrentTransactionTime'].push(transactionModel3);
      operationRateLimiter['transactionsInCurrentTransactionTime'].push(transactionModel4);

      const actual = operationRateLimiter['getHighestFeeTransactionsFromCurrentTransactionTime']();
      const expected = [transactionModel2, transactionModel3];
      expect(actual).toEqual(expected);
    });
  });
});
