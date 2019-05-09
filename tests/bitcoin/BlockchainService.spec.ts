import BlockchainService from '../../lib/bitcoin/BlockchainService';
import String from './util/String';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { IBitcoinConfig } from '../../lib/bitcoin/BitcoinConfig';
import { ResponseStatus, Response } from '../../lib/core/Response';

import retry = require('async-retry');

describe('BlockchainService', () => {
  const config: IBitcoinConfig = require('./bitcoin-test.json');
  const blockchainService = new BlockchainService(config);

  let bitcoredServiceUrlIsValid = true;
  beforeAll(async () => {
    // Make sure bitcored servie URL is valid before starting the tests.
    // NOTE: Code coverage run does not support `pending()` call in `beforeAll()` so calling `pending()` in `beforeEach()`.
    if (!String.isValidUrl(config.bitcoreExtensionUri)) {
      bitcoredServiceUrlIsValid = false;
      return;
    }

    await blockchainService.initialize();

    // Erase all transactions in database first.
    await blockchainService.transactionStore.removeTransactionsLaterThan();

    await blockchainService.startPeriodicProcessing();

    await retry(async (_bail: any) => {
      const transactionCount = await blockchainService.getTransactionsCount();
      if (transactionCount >= 20) {
        blockchainService.stopPeriodicProcessing();
        return;
      }

      // NOTE: retry will only occur if Error is thrown.
      throw new Error('No change to the processed transactions list.');
    }, {
      retries: 100,
      minTimeout: 500, // milliseconds
      maxTimeout: 500 // milliseconds
    });
  }, 20000); // Extended timeout as `beforeAll()` can take more than the default 5 seconds timeout.

  beforeEach(async () => {
    // Make sure bitcored servie URL is valid before starting the tests.
    if (!bitcoredServiceUrlIsValid) {
      // NOTE: `stopSpecOnExpectationFailure` must set to true in order for `beforeEach()` to not execute tests after `pending()` is called.
      pending(`Test skipped: Bitcored URL '${config.bitcoreExtensionUri}' in bitcoin-test.json is not a valid URL.`);
    }
  });

  it('should return the HTTP 400 for reogranized transactions request', async () => {
    const expectedResponse: Response = {
      'status': ResponseStatus.BadRequest,
      'body': {
        'code': 'invalid_transaction_number_or_time_hash'
      }
    };

    let transactionNumber = TransactionNumber.construct(1446559, 0);
    let transactionTimeHash = '000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe';
    const fetchedResponse = await blockchainService.handleFetchRequestCached(transactionNumber, transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for cached transactions request', async () => {
    const expectedResponse = {
      'status': ResponseStatus.Succeeded,
      'body':
      {
        'moreTransactions': true,
        'transactions': [{
          'transactionNumber': 6212927891701761,
          'transactionTime': 1446560, 'transactionTimeHash': '000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6212927891701762,
          'transactionTime': 1446560,
          'transactionTimeHash': '000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6212932186669056,
          'transactionTime': 1446561,
          'transactionTimeHash': '000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6212932186669057,
          'transactionTime': 1446561,
          'transactionTimeHash': '000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6212932186669058,
          'transactionTime': 1446561,
          'transactionTimeHash': '000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6212932186669059,
          'transactionTime': 1446561,
          'transactionTimeHash': '000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6213447582744576,
          'transactionTime': 1446681,
          'transactionTimeHash': '000000000000ff74c2f0973e6b9eb0fa6f9033ee093dc38e7cbec52b7cc5ef41',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6213477647515648,
          'transactionTime': 1446688,
          'transactionTimeHash': '0000000000126839564fdccc4d184fef602645519077d0eaf06bb3d5b3f33c73',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6213507712286720,
          'transactionTime': 1446695,
          'transactionTimeHash': '00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4d',
          'anchorFileHash': 'hellow'
        }, {
          'transactionNumber': 6213507712286721,
          'transactionTime': 1446695,
          'transactionTimeHash': '00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4d',
          'anchorFileHash': 'hellow'
        }]
      }
    };

    const transactionNumber = 6212927891701760;
    const transactionTimeHash = '000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199';
    const fetchedResponse = await blockchainService.handleFetchRequestCached(transactionNumber, transactionTimeHash) as any;
    expect(fetchedResponse.status).toEqual(expectedResponse.status);
    expect(fetchedResponse.body.moreTransactions).toEqual(expectedResponse.body.moreTransactions);
    expect(fetchedResponse.body.transactions.length).toEqual(expectedResponse.body.transactions.length);

    for (let i = 0; i < expectedResponse.body.transactions.length; i++) {
      const expectedTransaction = expectedResponse.body.transactions[i];
      const actualTransaction = fetchedResponse.body.transactions[i];
      expect(actualTransaction.anchorFileHash).toEqual(expectedTransaction.anchorFileHash);
      expect(actualTransaction.transactionNumber).toEqual(expectedTransaction.transactionNumber);
      expect(actualTransaction.transactionTime).toEqual(expectedTransaction.transactionTime);
      expect(actualTransaction.transactionTimeHash).toEqual(expectedTransaction.transactionTimeHash);
    }
  });

  it('should return the correct response body with content for firstValidCached request', async () => {
    const expectedResponse: Response = {
      'status': ResponseStatus.Succeeded,
      'body': {
        'transactionNumber': 6212927891701762,
        'transactionTime': 1446560,
        'transactionTimeHash': '000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199',
        'anchorFileHash': 'hellow'
      }
    };

    const requestBody = {
      'transactions': [
        {
          'transactionNumber': 6212927891701762,
          'transactionTime': 1446560,
          'transactionTimeHash': '000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199',
          'anchorFileHash': 'hellow'
        },
        {
          'transactionNumber': 6213507712286720,
          'transactionTime': 1446695,
          'transactionTimeHash': '00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4e',
          'anchorFileHash': 'hellow'
        }
      ]
    };

    const requestBodyBuffer = Buffer.from(JSON.stringify(requestBody));
    const fetchedResponse = await blockchainService.handleFirstValidRequestCached(requestBodyBuffer);
    expect(expectedResponse).toEqual(fetchedResponse);
  });
});
