import Blockchain from '../../lib/core/Blockchain';
import CoreErrorCode from '../../lib/core/ErrorCode';
import ErrorCode from '../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ReadableStream from '../../lib/common/ReadableStream';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import SidetreeError from '../../lib/common/SidetreeError';
import TransactionModel from '../../lib/common/models/TransactionModel';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';

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

    it('should throw if response body fails JSON parse.', async () => {
      const blockchainClient = new Blockchain('Unused URI');

      const mockFetchResponse = { status: 200 };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('An unexpected non JSON string.')));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => blockchainClient.read(1, 'Unused'),
        CoreErrorCode.BlockchainReadResponseBodyNotJson
      );
    });
  });

  describe('write()', async () => {
    it('should write as expected', async () => {
      const blockchainClient = new Blockchain('uri');
      const mockFetchResponse = {
        status: 200
      };
      const fetchSpy = spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      await blockchainClient.write('Unused anchor string.', 100);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should throw SidetreeError with correct error code if blockchain service returns an unexpected error.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 500,
        body: {
          read: () => { return 'Error message in body that gets printed to console.'; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => blockchainClient.write('Unused anchor string.', 100),
        CoreErrorCode.BlockchainWriteUnexpectedError
      );
    });

    it('should throw SidetreeError with correct error code if blockchain service returns a known Sidetree error.', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const dummyErrorCode = 'dummy error code';
      const mockFetchResponse = {
        status: 500,
        body: {
          read: () => { return JSON.stringify({ code: dummyErrorCode }); }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => blockchainClient.write('Unused anchor string.', 100),
        dummyErrorCode
      );
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
    it('should return the latest time', async () => {
      const blockchainClient = new Blockchain('Unused URI');
      const mockFetchResponse = {
        status: 200,
        body: {
          read: () => { return `{ "hash": "someHash", "time": 123 }`; }
        }
      };
      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      const result = await blockchainClient.getLatestTime();
      expect(result).toEqual({ hash: 'someHash', time: 123 });
    });

    it('should throw if encountered error when fetching time from blockchain service.', async () => {
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

  describe('getValueTimeLock', () => {
    it('should return the object returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 12134,
        identifier: 'identifier',
        lockTransactionTime: 11223,
        normalizedFee: 100,
        owner: 'some owner',
        unlockTransactionTime: 98734
      };

      const mockFetchResponse = {
        status: 200,
        body: JSON.stringify(mockValueTimeLock)
      };

      const fetchSpy = spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const identifierInput = 'identifier input';
      const actual = await blockchainClient.getValueTimeLock(identifierInput);

      expect(actual).toEqual(mockValueTimeLock);
      expect(fetchSpy).toHaveBeenCalledWith(`${blockchainClient['locksUri']}/${identifierInput}`);
      expect(readAllSpy).toHaveBeenCalledWith(mockFetchResponse.body);
      done();
    });

    it('should return undefined if not-found is returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 404,
        body: '{"code": "some error code"}'
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const actual = await blockchainClient.getValueTimeLock('non-existent-identifier');

      expect(actual).not.toBeDefined();
      done();
    });

    it('should throw if there is any other error returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 500,
        body: '{"code": "some error code"}'
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => blockchainClient.getValueTimeLock('non-existent-identifier'),
        CoreErrorCode.BlockchainGetLockResponseNotOk);

      done();
    });
  });

  describe('getWriterValueTimeLock', () => {
    it('should return the object returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 12134,
        identifier: 'identifier',
        lockTransactionTime: 11223,
        normalizedFee: 100,
        owner: 'some owner',
        unlockTransactionTime: 98734
      };

      const mockFetchResponse = {
        status: 200,
        body: JSON.stringify(mockValueTimeLock)
      };

      const fetchSpy = spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const actual = await blockchainClient.getWriterValueTimeLock();

      expect(actual).toEqual(mockValueTimeLock);
      expect(fetchSpy).toHaveBeenCalledWith(`${blockchainClient['writerLockUri']}`);
      expect(readAllSpy).toHaveBeenCalledWith(mockFetchResponse.body);
      done();
    });

    it('should return undefined if not-found is returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 404,
        body: '{"code": "some error code"}'
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const actual = await blockchainClient.getWriterValueTimeLock();

      expect(actual).not.toBeDefined();
      done();
    });

    it('should return undefined if pending-state error is returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 404,
        body: JSON.stringify({ code: ErrorCode.ValueTimeLockInPendingState })
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      const actual = await blockchainClient.getWriterValueTimeLock();
      expect(actual).toBeUndefined();
      done();
    });

    it('should throw generic error if HTTP 200 is not returned by the network call.', async (done) => {
      const blockchainClient = new Blockchain('unused');

      const mockFetchResponse = {
        status: 500,
        body: '{"code": "some error code"}'
      };

      spyOn(blockchainClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(mockFetchResponse.body)));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => blockchainClient.getWriterValueTimeLock(),
        CoreErrorCode.BlockchainGetWriterLockResponseNotOk);

      done();
    });
  });
});
