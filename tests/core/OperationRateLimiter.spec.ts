import OperationRateLimiter from '../../lib/core/versions/latest/OperationRateLimiter';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';

describe('OperationRateLimiter', () => {

  let operationRateLimiter: OperationRateLimiter;

  function getTestTransactionsFor1Block () {
    return [
      {
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash',
          numberOfOperations: 12
        }),
        transactionFeePaid: 333,
        normalizedTransactionFee: 1
      },
      {
        transactionNumber: 2,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash2',
          numberOfOperations: 11
        }),
        transactionFeePaid: 998, // highest fee should come first
        normalizedTransactionFee: 1
      },
      {
        transactionNumber: 3,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash3',
          numberOfOperations: 8
        }),
        transactionFeePaid: 999, // second highest fee should come second
        normalizedTransactionFee: 1
      },
      {
        transactionNumber: 4,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash4',
          numberOfOperations: 1
        }),
        transactionFeePaid: 14,
        normalizedTransactionFee: 1
      }
    ];
  }

  function getTestTransactionsForMultipleBlocks () {
    const block1Transactions = getTestTransactionsFor1Block();
    const block2Transactions = [
      {
        transactionNumber: 5,
        transactionTime: 2,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash5',
          numberOfOperations: 1
        }),
        transactionFeePaid: 1232,
        normalizedTransactionFee: 1
      }
    ];
    const block3Transactions = [
      {
        transactionNumber: 6,
        transactionTime: 3,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash6',
          numberOfOperations: 1
        }),
        transactionFeePaid: 123,
        normalizedTransactionFee: 1
      },
      {
        transactionNumber: 7,
        transactionTime: 3,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash7',
          numberOfOperations: 23
        }),
        transactionFeePaid: 123,
        normalizedTransactionFee: 1
      }
    ];

    return block1Transactions.concat(block2Transactions).concat(block3Transactions);
  }

  beforeEach(() => {
    operationRateLimiter = new OperationRateLimiter(25);
  });

  describe('getHighestFeeTransactionsFromCurrentTransactionTime', () => {
    it('should return the correct list of transactions in the expected order', () => {
      const transactions = getTestTransactionsFor1Block();
      operationRateLimiter['currentTransactionTime'] = 12345;
      for (let transaction of transactions) {
        operationRateLimiter['transactionsInCurrentTransactionTime'].push(transaction);
      }

      const actual = operationRateLimiter['getHighestFeeTransactionsFromCurrentTransactionTime']();
      // transaction index 1 and 2 have the highest fee and fills up the 25 operation limit
      const expected = [transactions[1], transactions[2]];
      expect(actual).toEqual(expected);
    });
  });

  describe('getHighestFeeTransactionsPerBlock', () => {
    it('should return the correct list of transactions and keep the correct state', () => {
      const transactions = getTestTransactionsForMultipleBlocks();
      const actualResult = operationRateLimiter.getHighestFeeTransactionsPerBlock(transactions);
      const expectedResult = [
        transactions[1],
        transactions[2],
        transactions[4]
      ];
      expect(actualResult).toEqual(expectedResult);
      expect(operationRateLimiter['currentTransactionTime']).toEqual(3);
      expect(operationRateLimiter['transactionsInCurrentTransactionTime'].pop()).toEqual(transactions[5]);
      expect(operationRateLimiter['transactionsInCurrentTransactionTime'].pop()).toEqual(transactions[6]);
    });

    it('should pick up where it left off if given an array containing blocks it had seen previously', () => {
      const transactions = getTestTransactionsForMultipleBlocks();
      operationRateLimiter.getHighestFeeTransactionsPerBlock(transactions);
      const moreTransactions = [
        {
          transactionNumber: 8,
          transactionTime: 3,
          transactionTimeHash: 'some hash',
          anchorString: AnchoredDataSerializer.serialize({
            anchorFileHash: 'file_hash8',
            numberOfOperations: 1
          }),
          transactionFeePaid: 1232,
          normalizedTransactionFee: 1
        },
        {
          transactionNumber: 9,
          transactionTime: 4,
          transactionTimeHash: 'some hash',
          anchorString: AnchoredDataSerializer.serialize({
            anchorFileHash: 'file_hash9',
            numberOfOperations: 1
          }),
          transactionFeePaid: 1232,
          normalizedTransactionFee: 1
        }
      ];
      const actualResult = operationRateLimiter.getHighestFeeTransactionsPerBlock(moreTransactions);
      expect(actualResult).toEqual([transactions[5], transactions[6], moreTransactions[0]]);
      expect(operationRateLimiter['currentTransactionTime']).toEqual(4);
      expect(operationRateLimiter['transactionsInCurrentTransactionTime'].pop()).toEqual(moreTransactions[1]);
    });
  });

  describe('reset', () => {
    it('should reset the rate limiter by setting currentTransactionTime to undefined and transactionsInCurrentTransactionTime to empty priority queue', () => {
      const transactions = getTestTransactionsFor1Block();
      operationRateLimiter.getHighestFeeTransactionsPerBlock(transactions);
      expect(operationRateLimiter['currentTransactionTime']).toBeDefined();
      expect(operationRateLimiter['transactionsInCurrentTransactionTime'].top()).toBeDefined();

      operationRateLimiter.clear();
      expect(operationRateLimiter['currentTransactionTime']).toBeUndefined();
      // top throws error when called on empty priority queue
      try {
        operationRateLimiter['transactionsInCurrentTransactionTime'].top();
      } catch (e) {
        expect(e.message).toEqual('invalid operation: top() called for empty BinaryHeap');
      }
    });
  });
});
