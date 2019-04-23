import BlockchainService from '../src/BlockchainService';
import { ResponseStatus, Response } from '../src/Response';
import { Config, ConfigKey } from '../src/Config';
import TransactionNumber from '../src/TransactionNumber';
import retry = require('async-retry');

describe('BlockchainService', () => {

  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);
  const uri = config[ConfigKey.BitcoreSidetreeServiceUri];
  const prefix = config[ConfigKey.SidetreeTransactionPrefix];
  const genesisTransactionNumber = TransactionNumber.construct(Number(config[ConfigKey.BitcoinSidetreeGenesisBlockNumber]), 0);
  const genesisTimeHash = config[ConfigKey.BitcoinSidetreeGenesisBlockHash];
  const bitcoinPollingInternalSeconds = Number(config[ConfigKey.BitcoinPollingInternalSeconds]);
  const maxSidetreeTransactions = Number(config[ConfigKey.MaxSidetreeTransactions]);
  const blockchainService = new BlockchainService(uri, prefix, genesisTransactionNumber, genesisTimeHash, bitcoinPollingInternalSeconds, maxSidetreeTransactions);


  it('should return the HTTP 400 for reogranized transactions request', async () => {
    blockchainService.initialize();
    await retry(async (_bail: any) => {
      const transactionCount = await blockchainService.getTransactionsCount();
      if (transactionCount >= 20) {
        blockchainService.stopPeriodicProcessing();
        return;
      }
    }, {
        retries: 10,
        minTimeout: 500, // milliseconds
        maxTimeout: 500 // milliseconds
      });

    const expectedResponse: Response = {
      "status": ResponseStatus.BadRequest,
      "body": {
        'code': 'invalid_transaction_number_or_time_hash'
      }
    }

    await delay(2000);
    var transactionNumber = TransactionNumber.construct(1446559, 0);
    var transactionTimeHash = "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe";
    const fetchedResponse = await blockchainService.handleFetchRequestCached(transactionNumber, transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);

  });

  function delay (ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  it('should return the correct response body with content for cached transactions request', async () => {
    blockchainService.initialize();

    const transactionCount = await blockchainService.getTransactionsCount();
    await retry(async (_bail: any) => {
      if (transactionCount >= 20) {
        blockchainService.stopPeriodicProcessing();
        return;
      }
    }, {
        retries: 100,
        minTimeout: 500, // milliseconds
        maxTimeout: 500 // milliseconds
      });

    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body":
      {
        "moreTransactions": true,
        "transactions": [{
          "transactionNumber": 6212927891701761,
          "transactionTime": 1446560, "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6212927891701762,
          "transactionTime": 1446560,
          "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6212932186669056,
          "transactionTime": 1446561,
          "transactionTimeHash": "000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6212932186669057,
          "transactionTime": 1446561,
          "transactionTimeHash": "000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6212932186669058,
          "transactionTime": 1446561,
          "transactionTimeHash": "000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6212932186669059,
          "transactionTime": 1446561,
          "transactionTimeHash": "000000000011ed012584302ca6ba3a322f8397ffaf61f41d884b2375b73f16aa",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6213447582744576,
          "transactionTime": 1446681,
          "transactionTimeHash": "000000000000ff74c2f0973e6b9eb0fa6f9033ee093dc38e7cbec52b7cc5ef41",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6213477647515648,
          "transactionTime": 1446688,
          "transactionTimeHash": "0000000000126839564fdccc4d184fef602645519077d0eaf06bb3d5b3f33c73",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6213507712286720,
          "transactionTime": 1446695,
          "transactionTimeHash": "00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4d",
          "anchorFileHash": "hellow"
        }, {
          "transactionNumber": 6213507712286721,
          "transactionTime": 1446695,
          "transactionTimeHash": "00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4d",
          "anchorFileHash": "hellow"
        }]
      }
    }

    await delay(2000);
    var transactionNumber = 6212927891701760;
    var transactionTimeHash = "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199";
    const fetchedResponse = await blockchainService.handleFetchRequestCached(transactionNumber, transactionTimeHash);
    expect(fetchedResponse).toEqual(expectedResponse);
  });

  it('should return the correct response body with content for firstValidCached request', async () => {
    blockchainService.initialize();
    await retry(async (_bail: any) => {
      const transactionCount = await blockchainService.getTransactionsCount();
      if (transactionCount >= 200) {
        blockchainService.stopPeriodicProcessing();
        return;
      }
    }, {
        retries: 10,
        minTimeout: 500, // milliseconds
        maxTimeout: 500 // milliseconds
      });

    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body": {
        "transactionNumber": 6212927891701762,
        "transactionTime": 1446560,
        "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
        "anchorFileHash": "hellow"
      }
    };

    const requestBody = {
      "transactions": [
        {
          "transactionNumber": 6212927891701762,
          "transactionTime": 1446560,
          "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
          "anchorFileHash": "hellow"
        },
        {
          "transactionNumber": 6213507712286720,
          "transactionTime": 1446695,
          "transactionTimeHash": "00000000000d322bad7f213caabe5d799d6d8c9cebc6a9687a308ca70d602c4e",
          "anchorFileHash": "hellow"
        },
      ]
    };

    await delay(2000);
    const requestBodyBuffer = Buffer.from(JSON.stringify(requestBody));
    const fetchedResponse = await blockchainService.handleFirstValidRequestCached(requestBodyBuffer);
    expect(expectedResponse).toEqual(fetchedResponse);
  });
});