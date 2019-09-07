import Blockchain from '../../lib/core/Blockchain';
import ReadableStream from '../../lib/common/ReadableStream';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import TransactionModel from '../../lib/common/models/TransactionModel';
// import { FetchResultCode } from '../../lib/common/FetchResultCode';

describe('Blockchain', async () => {
  describe('read()', async () => {
    it('should return transactions fetched.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 200,
        body: {
          read: () => { return 'Ignored body.'; }
        }
      };
      const mockReadableStreamReadString = JSON.stringify({
        moreTransactions: false,
        transactions: [{
          anchorString: '1',
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: '1'
        }]
      });
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(mockReadableStreamReadString));

      const readResult = await blockchainClient.read();
      expect(readResult.moreTransactions).toBeFalsy();
      expect(readResult.transactions.length).toEqual(1);
      expect(readResult.transactions[0].transactionNumber).toEqual(1);
    });

    it('should throw SidetreeError with correct code when if invalid time hash is given.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 400,
        body: {
          read: () => { return 'Ignored body.'; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify({
        code: SharedErrorCode.InvalidTransactionNumberOrTimeHash
      })));

      try {
        await blockchainClient.read();
      } catch (error) {
        // Throwing error is the expected case.

        if (error.code !== SharedErrorCode.InvalidTransactionNumberOrTimeHash) {
          fail();
        }

        return;
      }

      fail();
    });

    it('should throw if error is encountered when reading transactions.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 500,
        body: {
          read: () => { return 'Error message in body that gets printed to console.'; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify({
        code: 'unused'
      })));

      try {
        await blockchainClient.read(1, 'Unused transaction hash.');
      } catch {
        // Throwing error is the expected case.
        return;
      }

      fail();
    });

    it('should throw if not both the transaction time and hash are given.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      try {
        await blockchainClient.read(1, undefined);
      } catch {
        // Throwing error is the expected case.
        return;
      }

      fail();
    });
  });

  describe('write()', async () => {
    it('should throw if writing anchor string returned an error.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 500,
        body: {
          read: () => { return 'Error message in body that gets printed to console.'; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      try {
        await blockchainClient.write('Unused anchor string.');
      } catch {
        // Throwing error is the expected case.
        return;
      }

      fail();
    });
  });

  describe('initialize()', async () => {
    it('should initialize cached blockchain time during initialize().', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 200,
        body: {
          read: () => {
            return JSON.stringify({
              time: 100,
              hash: '100'
            });
          }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      await blockchainClient.initialize();
      const approximateTime = blockchainClient.approximateTime;

      expect(approximateTime.time).toEqual(100);
      expect(approximateTime.hash).toEqual('100');
    });
  });

  describe('getFirstValidTransaction()', async () => {
    it('should return the transaction returned by the underlying blockchain service.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 200,
        body: {
          read: () => {
            return JSON.stringify({
              anchorString: '0',
              transactionNumber: 0,
              transactionTime: 0,
              transactionTimeHash: '0'
            });
          }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      const unusedTransactions: TransactionModel[] = [
        {
          anchorString: 'unused',
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: 'unused'
        }
      ];
      const firstValidTransaction = await blockchainClient.getFirstValidTransaction(unusedTransactions);

      expect(firstValidTransaction).toBeDefined();
      expect(firstValidTransaction!.anchorString).toEqual('0');
      expect(firstValidTransaction!.transactionNumber).toEqual(0);
      expect(firstValidTransaction!.transactionTime).toEqual(0);
      expect(firstValidTransaction!.transactionTimeHash).toEqual('0');
    });

    it('should return undefined if valid transaction cannot be found.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 404,
        body: {
          read: () => {
            return 'Unused response body.';
          }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      const unusedTransactions: TransactionModel[] = [
        {
          anchorString: 'unused',
          transactionNumber: 1,
          transactionTime: 1,
          transactionTimeHash: 'unused'
        }
      ];
      const firstValidTransaction = await blockchainClient.getFirstValidTransaction(unusedTransactions);

      expect(firstValidTransaction).toBeUndefined();
    });
  });

  describe('getLatestTime()', async () => {
    it('should throw if encountered error when fetching time from blockchain service..', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 500,
        body: {
          read: () => { return 'Error message in body that gets printed to console.'; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      try {
        await blockchainClient.getLatestTime();
      } catch {
        // Throwing error is the expected case.
        return;
      }

      fail();
    });
  });
});
