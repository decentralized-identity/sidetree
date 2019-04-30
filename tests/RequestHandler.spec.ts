import RequestHandler from '../lib/RequestHandler';
import String from './util/String';
import TransactionNumber from '../lib/TransactionNumber';
import { IConfig } from '../lib/Config';
import { IResponse, ResponseStatus, Response } from '../lib/Response';

describe('RequestHandler', () => {

  const config: IConfig = require('../json/config-test.json');
  const uri = config.bitcoreSidetreeServiceUri;
  const prefix = config.sidetreeTransactionPrefix;
  const genesisTransactionNumber = TransactionNumber.construct(config.bitcoinSidetreeGenesisBlockNumber, 0);
  const genesisTimeHash = config.bitcoinSidetreeGenesisBlockHash;

  const requestHandler = new RequestHandler(uri, prefix, genesisTransactionNumber, genesisTimeHash);

  beforeEach(async () => {
    // Make sure bitcored servie URL is valid before starting the tests.
    if (!String.isValidUrl(uri)) {
      pending(`Test skipped: Bitcored URL '${uri}' in config-test.json is not a valid URL.`);
    }
  });

  it('should return the correct response body with height for blocks last request', async () => {
    const expectedResponse: IResponse = {
      status: ResponseStatus.Succeeded,
      body: {
        'time': 1444118,
        'hash': '00000000000000c0e5f7ef7f5e7ff8bd61b41e04db4035ec7be67a59c50cbb64'
      }
    };

    const fetchedResponse = await requestHandler.handleLastBlockRequest();
    expect(fetchedResponse.status).toEqual(expectedResponse.status);
  });


  it('should return the correct response body with height for blocks request', async () => {
    const expectedResponse: Response = {
      status: ResponseStatus.Succeeded,
      body: {
        'time': 1441560,
        'hash': '00000000000001599eedbd98b0f1a5205d468b1f618931ac98e16d14f60b1fb8'
      }
    };

    const fetchedResponse = await requestHandler.handleBlockByHashRequest('00000000000001599eedbd98b0f1a5205d468b1f618931ac98e16d14f60b1fb8');
    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for anchor request', async () => {
    const expectedResponse: IResponse = {
      status: ResponseStatus.Succeeded,
      body: {}
    };

    const anchorRequestBody = {
      anchorFileHash: 'hellow'
    };
    const anchorRequestBodyBuffer = Buffer.from(JSON.stringify(anchorRequestBody));

    const fetchedResponse = await requestHandler.handleAnchorRequest(anchorRequestBodyBuffer);
    expect(expectedResponse.status).toEqual(fetchedResponse.status);
  });


  it('should return the HTTP 400 for reogranized transactions request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.BadRequest,
      "body": {
        'code': 'invalid_transaction_number_or_time_hash'
      }
    }

    var transactionNumber = TransactionNumber.construct(1446559, 0);
    var transactionTimeHash = "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber, transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);
  });


  it('should return the correct response body with content for transactions request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body": {
        "moreTransactions": true,
        "transactions": [
          {
            "transactionNumber": 6212923596734464,
            "transactionTime": 1446559,
            "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efd",
            "anchorFileHash": "hellow"
          }]
      }
    }


    var transactionNumber = TransactionNumber.construct(1446557, 0);
    var transactionTimeHash = "000000000000005f62979f4e2edf33efffe3148d2d8fec3b9c64d8d8f190fd07";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber, transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);
  });

  // check if pagination works even within a block
  it('should return the correct response body with content for transactions request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body": {
        "moreTransactions": true,
        "transactions": [
          {
            "transactionNumber": 6212927891701761,
            "transactionTime": 1446560,
            "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
            "anchorFileHash": "hellow"
          }, {
            "transactionNumber": 6212927891701762,
            "transactionTime": 1446560,
            "transactionTimeHash": "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199",
            "anchorFileHash": "hellow"
          }]
      }
    }

    const transactionNumber = 6212927891701760;
    const transactionTimeHash = "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber, transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for firstValid request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body": {
        "transactionNumber": 6212923596734464,
        "transactionTime": 1446559,
        "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efd",
        "anchorFileHash": "hellow"
      }
    };

    const requestBody = {
      "transactions": [
        {
          "transactionNumber": 6212923596734464,
          "transactionTime": 1446559,
          "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efd",
          "anchorFileHash": "hellow"
        },
        {
          "transactionNumber": 6212923596734464,
          "transactionTime": 1446559,
          "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe",
          "anchorFileHash": "hellow"
        },
      ]
    };

    const requestBodyBuffer = Buffer.from(JSON.stringify(requestBody));
    const fetchedResponse = await requestHandler.handleFirstValidRequest(requestBodyBuffer);
    expect(expectedResponse).toEqual(fetchedResponse);
  });
});