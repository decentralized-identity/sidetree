import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import TransactionSelector from '../../lib/core/versions/latest/TransactionSelector';
import TransactionModel from '../../lib/common/models/TransactionModel';

describe('TransactionSelector', () => {

  let transactionSelector: TransactionSelector;
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
        normalizedTransactionFee: 1,
        writer: 'writer1'
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
        normalizedTransactionFee: 1,
        writer: 'writer2'
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
        normalizedTransactionFee: 1,
        writer: 'writer3'
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
        normalizedTransactionFee: 1,
        writer: 'writer4'
      }
    ];
  }

  beforeEach(() => {
    transactionStore = new MockTransactionStore();
    transactionSelector = new TransactionSelector(transactionStore);
    // hard set number for ease of testing
    transactionSelector['maxNumberOfTransactionsPerBlock'] = 10;
    transactionSelector['maxNumberOfOperationsPerBlock'] = 25;
  });

  describe('selectQualifiedTransactions', () => {
    it('should return the expected transactions with limit on operation', async () => {
      // max operation is 25 by default in before each
      const transactions = getTestTransactionsFor1Block();
      const result = await transactionSelector.selectQualifiedTransactions(transactions);
      const expected = [
        {
          transactionNumber: 3,
          transactionTime: 1,
          transactionTimeHash: 'some hash',
          anchorString: AnchoredDataSerializer.serialize({
            anchorFileHash: 'file_hash3',
            numberOfOperations: 8
          }),
          transactionFeePaid: 999, // highest fee should come first
          normalizedTransactionFee: 1,
          writer: 'writer3'
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
          normalizedTransactionFee: 1,
          writer: 'writer2'
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should return the expected transactions with limit on 1 transaction per writer', async () => {
      // max operation is 25 by default in before each
      const transactions = getTestTransactionsFor1Block();

      // make all transactions the same writer except the last one
      for (const transaction of transactions) {
        transaction.writer = 'sameWriterForAllExceptLast';
      }
      transactions[transactions.length - 1].writer = 'aDifferentWriter';

      const result = await transactionSelector.selectQualifiedTransactions(transactions);

      // expect the first and last transaction because the first one is the first from the repeating writer and the last one is from a different writer
      const expected = [transactions[0], transactions[transactions.length - 1]];
      expect(result).toEqual(expected);
    });

    it('should return the expected transactions with limit on transaction', async () => {
      transactionSelector = new TransactionSelector(transactionStore);
      // set transactions limit to 1 to see proper limiting, and set operation to 100 so it does not filter.
      transactionSelector['maxNumberOfTransactionsPerBlock'] = 1;
      transactionSelector['maxNumberOfOperationsPerBlock'] = 100;
      const transactions = getTestTransactionsFor1Block();
      const result = await transactionSelector.selectQualifiedTransactions(transactions);
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
          normalizedTransactionFee: 1,
          writer: 'writer3'
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should return an empty array when an empty array is passed in', async () => {
      const result = await transactionSelector.selectQualifiedTransactions([]);
      const expected: TransactionModel[] = [];
      expect(result).toEqual(expected);
    });

    it('should throw expected error if the array passed in contains transactions from multiple different blocks', async () => {
      const transactions = getTestTransactionsFor1Block();
      transactions[transactions.length - 1].transactionTime = 12324;

      try {
        await transactionSelector.selectQualifiedTransactions(transactions);
      } catch (e) {
        expect(e.message).toEqual('transactions_not_in_same_block: transaction must be in the same block to perform rate limiting, investigate and fix');
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
        normalizedTransactionFee: 1,
        writer: 'writer'
      };

      await transactionStore.addTransaction(extraTransaction);
      const transactions = getTestTransactionsFor1Block();
      const result = await transactionSelector.selectQualifiedTransactions(transactions);
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
          normalizedTransactionFee: 1,
          writer: 'writer3'
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should deduct the number of transactions if transactions in the current block were already in transactions store', async () => {
      transactionSelector = new TransactionSelector(transactionStore);
      // set to never reach operation limit but can see transaction limiting
      transactionSelector['maxNumberOfTransactionsPerBlock'] = 2;
      transactionSelector['maxNumberOfOperationsPerBlock'] = 10000;
      const extraTransaction = {
        transactionNumber: 0,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: AnchoredDataSerializer.serialize({
          anchorFileHash: 'file_hash',
          numberOfOperations: 1
        }),
        transactionFeePaid: 9999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };

      await transactionStore.addTransaction(extraTransaction);
      const transactions = getTestTransactionsFor1Block();
      const result = await transactionSelector.selectQualifiedTransactions(transactions);
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
          normalizedTransactionFee: 1,
          writer: 'writer3'
        }
      ];
      expect(result).toEqual(expected);
    });

    it('should skip transactions that are not parsable', async () => {
      const transactions = getTestTransactionsFor1Block();

      // this makes the parsing fail when reading from db
      const extraTransaction = {
        transactionNumber: 0,
        transactionTime: 1,
        transactionTimeHash: 'some hash',
        anchorString: 'thisIsABadString',
        transactionFeePaid: 9999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      await transactionStore.addTransaction(extraTransaction);

      // this makes the parsing fail when reading new transactions
      spyOn(AnchoredDataSerializer, 'deserialize').and.throwError('some error');

      const result = await transactionSelector.selectQualifiedTransactions(transactions);
      const expected: TransactionModel[] = [];
      expect(result).toEqual(expected);
    });
  });

  describe('getNumberOfOperationsAndTransactionsAlreadyInTransactionTime', () => {
    it('should handle when transactions store returns undefined', async () => {
      spyOn(transactionStore, 'getTransactionsStartingFrom').and.returnValue(new Promise((resolve) => {
        resolve(undefined);
      }));

      const result = await transactionSelector['getNumberOfOperationsAndTransactionsAlreadyInTransactionTime'](1);
      expect(result).toEqual([0, 0]);
    });
  });
});
