import Blockchain from '../../lib/core/Blockchain';
import CoreErrorCode from '../../lib/core/CoreErrorCode';
import ReadableStream from '../../lib/common/ReadableStream';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import SidetreeError from '../../lib/core/SidetreeError';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import TransactionModel from '../../lib/common/models/TransactionModel';

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
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockReadableStreamReadString)));

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
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({
        code: SharedErrorCode.InvalidTransactionNumberOrTimeHash
      }))));

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
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({
        code: 'unused'
      }))));

      try {
        await blockchainClient.read(1, 'Unused transaction hash.');
      } catch (error) {
        // Throwing error is the expected case.

        if (error.code !== CoreErrorCode.BlockchainReadResponseNotOk) {
          fail();
        }

        return;
      }

      fail();
    });

    it('should throw if not both the transaction time and hash are given.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      try {
        await blockchainClient.read(1, undefined);
      } catch (error) {
        // Throwing error is the expected case.

        if (error.code !== CoreErrorCode.BlockchainReadInvalidArguments) {
          fail();
        }

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
        await blockchainClient.write('Unused anchor string.', 100);
      } catch (error) {
        // Throwing error is the expected case.

        if (error.code !== CoreErrorCode.BlockchainWriteResponseNotOk) {
          fail();
        }

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
          transactionTimeHash: 'unused',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer'
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
          transactionTimeHash: 'unused',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer'
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
      } catch (error) {
        // Throwing error is the expected case.

        if (error.code !== CoreErrorCode.BlockchainGetLatestTimeResponseNotOk) {
          fail();
        }

        return;
      }

      fail();
    });
  });

  describe('initialize', async () => {
    it('should initialize the member variables.', async () => {
      const blockchainClient = new Blockchain('unused URI');

      const getTimeSpy = spyOn(blockchainClient, 'getLatestTime').and.returnValue(Promise.resolve({ time: 100, hash: '100' }));

      await blockchainClient.initialize();

      expect(getTimeSpy).toHaveBeenCalled();
    });
  });

  describe('getCachedVersion', async () => {
    it('should get the version from the service version fetcher', async () => {
      const blockchainClient = new Blockchain('unused');
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };

      const serviceVersionSpy = spyOn(blockchainClient['serviceVersionFetcher'], 'getVersion').and.returnValue(Promise.resolve(expectedServiceVersion));

      const fetchedServiceVersion = await blockchainClient.getServiceVersion();

      expect(serviceVersionSpy).toHaveBeenCalled();
      expect(fetchedServiceVersion).toEqual(expectedServiceVersion);
    });
  });

  describe('getFee', async () => {
    it('should get the fee returned by the blockchain service', async () => {
      const blockchainClient = new Blockchain('unused');
      const expectedFee = 12345;

      const mockFetchResponse = {
        status: 200,
        body: `{ "normalizedTransactionFee": ${expectedFee} }`
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const feeResponse = await blockchainClient.getFee(7890);
      expect(feeResponse).toEqual(expectedFee);
    });

    it('should throw if the response is not 200', async () => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 500,
        body: '{}'
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      await expectAsync(blockchainClient.getFee(700)).toBeRejectedWith(new SidetreeError(CoreErrorCode.BlockchainGetFeeResponseNotOk));
    });

    it('should throw if the response is 400 with the specific error code', async () => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 400,
        body: `{"code": "${SharedErrorCode.BlockchainTimeOutOfRange}"}`
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      await expectAsync(blockchainClient.getFee(700)).toBeRejectedWith(new SidetreeError(SharedErrorCode.BlockchainTimeOutOfRange));
    });

    it('should throw if the response is 400 but the error code is generic', async () => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 400,
        body: `{"code": "something happened"}`
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      await expectAsync(blockchainClient.getFee(700)).toBeRejectedWith(new SidetreeError(CoreErrorCode.BlockchainGetFeeResponseNotOk));
    });
  });
});
