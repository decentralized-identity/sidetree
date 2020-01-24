import ITransactionSelector from '../../lib/core/interfaces/ITransactionSelector';
import MockTransactionStore from '../mocks/MockTransactionStore';
import MockVersionManager from '../mocks/MockVersionManager';
import ThroughputLimiter from '../../lib/core/ThroughputLimiter';
import TransactionSelector from '../../lib/core/versions/latest/TransactionSelector';

describe('ThroughputLimiter', () => {
  let throughputLimiter: ThroughputLimiter;
  const versionManager = new MockVersionManager();
  let transactionSelector: ITransactionSelector;
  beforeEach(() => {
    transactionSelector = new TransactionSelector(new MockTransactionStore());
    spyOn(transactionSelector, 'selectQualifiedTransactions');
    spyOn(versionManager, 'getTransactionSelector').and.returnValue(transactionSelector);
    throughputLimiter = new ThroughputLimiter(versionManager);
  });

  describe('reset', () => {
    it('should reset instance variables to default', () => {
      throughputLimiter['currentBlockHeight'] = 1;
      throughputLimiter['transactionsInCurrentBlock'] = [
        {
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 333,
          normalizedTransactionFee: 1
        }
      ];
      throughputLimiter.reset();
      expect(throughputLimiter['currentBlockHeight']).toBeUndefined();
      expect(throughputLimiter['transactionsInCurrentBlock']).toEqual([]);
    });
  });

  describe('getQualifiedTransactions', () => {
    it('should execute with expected behavior', async () => {
      const transactions = [
        {
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 333,
          normalizedTransactionFee: 1
        },
        {
          transactionNumber: 2,
          transactionTime: 2,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 998,
          normalizedTransactionFee: 1
        },
        {
          transactionNumber: 3,
          transactionTime: 2,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 999,
          normalizedTransactionFee: 1
        },
        {
          transactionNumber: 4,
          transactionTime: 3,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 14,
          normalizedTransactionFee: 1
        }
      ];

      await throughputLimiter.getQualifiedTransactions(transactions);
      expect(throughputLimiter['currentBlockHeight']).toEqual(3);
      expect(throughputLimiter['transactionsInCurrentBlock']).toEqual([
        {
          transactionNumber: 4,
          transactionTime: 3,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 14,
          normalizedTransactionFee: 1
        }
      ]);
      expect(transactionSelector.selectQualifiedTransactions).toHaveBeenCalledTimes(2);
    });
  });
});
