import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import ThroughputLimiter from '../../lib/core/versions/latest/ThroughputLimiter';
import TransactionModel from '../../lib/common/models/TransactionModel';

describe('OperationRateLimiter', () => {

  let throughputLimiter: ThroughputLimiter;
  let transactionStore: ITransactionStore;

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
        transactionFeePaid: 998, // second highest fee should come second
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
        transactionFeePaid: 999, // highest fee should come first
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

  beforeEach(() => {
    transactionStore = new MockTransactionStore();
    throughputLimiter = new ThroughputLimiter(10, 25, transactionStore);
  });

  describe('selectQualifiedTransactions', () => {
    it('should return the expected transactions with limit on operation', async () => {
      const transactions = getTestTransactionsFor1Block();
      const result = await throughputLimiter.selectQualifiedTransactions(transactions);
      const expected = [
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
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should return the expected transactions with limit on transaction', async () => {
      throughputLimiter = new ThroughputLimiter(1, 100, transactionStore);
      const transactions = getTestTransactionsFor1Block();
      const result = await throughputLimiter.selectQualifiedTransactions(transactions);
      const expected = [
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
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should return an empty array when an empty array is passed in', async () => {
      const result = await throughputLimiter.selectQualifiedTransactions([]);
      const expected: TransactionModel[] = [];
      expect(result).toEqual(expected);
    });

    it('should throw expected error if the array passed in contains transactions from multiple different blocks', async () => {
      const transactions = getTestTransactionsFor1Block();
      transactions[transactions.length - 1].transactionTime = 12324;

      try {
        await throughputLimiter.selectQualifiedTransactions(transactions);
      } catch (e) {
        expect(e.message).toEqual('transactions_not_in_same_block: transaction must be in the same block to perform rate limiting');
      }
    });

    it('should deduct the number of operations if some operations in the current block were already in transactions store', async () => {
      const extraTransaction = {
        transactionNumber: 0,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash',
          numberOfOperations: 16
        }),
        transactionFeePaid: 9999,
        normalizedTransactionFee: 1
      };

      await transactionStore.addTransaction(extraTransaction);
      const transactions = getTestTransactionsFor1Block();
      const result = await throughputLimiter.selectQualifiedTransactions(transactions);
      const expected = [
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
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should deduct the number of transactions if transactions in the current block were already in transactions store', async () => {
      throughputLimiter = new ThroughputLimiter(2, 10000, transactionStore);
      const extraTransaction = {
        transactionNumber: 0,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash',
          numberOfOperations: 1
        }),
        transactionFeePaid: 9999,
        normalizedTransactionFee: 1
      };

      await transactionStore.addTransaction(extraTransaction);
      const transactions = getTestTransactionsFor1Block();
      const result = await throughputLimiter.selectQualifiedTransactions(transactions);
      const expected = [
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
        }
      ];
      expect(result).toEqual(expected);
    });
  });
});
