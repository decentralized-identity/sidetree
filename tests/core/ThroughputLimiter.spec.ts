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
    spyOn(transactionSelector, 'selectQualifiedTransactions').and.callFake(
      (transactions) => {
        // mock selecting the first one
        return new Promise((resolve) => { resolve([transactions[0]]); });
      }
    );
    spyOn(versionManager, 'getTransactionSelector').and.returnValue(transactionSelector);
    throughputLimiter = new ThroughputLimiter(versionManager);
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
          normalizedTransactionFee: 1,
          writer: 'writer1'
        },
        {
          transactionNumber: 2,
          transactionTime: 2,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 998,
          normalizedTransactionFee: 1,
          writer: 'writer2'
        },
        {
          transactionNumber: 3,
          transactionTime: 2,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 999,
          normalizedTransactionFee: 1,
          writer: 'writer3'
        },
        {
          transactionNumber: 4,
          transactionTime: 3,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 14,
          normalizedTransactionFee: 1,
          writer: 'writer4'
        }
      ];

      const result = await throughputLimiter.getQualifiedTransactions(transactions);

      const expected = [
        {
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 333,
          normalizedTransactionFee: 1,
          writer: 'writer1'
        },
        {
          transactionNumber: 2,
          transactionTime: 2,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 998,
          normalizedTransactionFee: 1,
          writer: 'writer2'
        },
        {
          transactionNumber: 4,
          transactionTime: 3,
          transactionTimeHash: 'some hash',
          anchorString: 'some string',
          transactionFeePaid: 14,
          normalizedTransactionFee: 1,
          writer: 'writer4'
        }
      ];

      expect(transactionSelector.selectQualifiedTransactions).toHaveBeenCalledTimes(3);
      expect(result).toEqual(expected);
    });
  });
});
