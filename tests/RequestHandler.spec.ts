import RequestHandler from '../src/RequestHandler';
import { ResponseStatus, Response } from '../src/Response';
import { Config, ConfigKey } from '../src/Config';
import TransactionNumber from '../src/TransactionNumber';

describe('RequestHandler', () => {

  const configFile = require('../json/config.json');
  const config = new Config(configFile);
  const uri = config[ConfigKey.BitcoreSidetreeServiceUri];
  const prefix = config[ConfigKey.SidetreeTransactionPrefix];
  const genesisTransactionNumber = new TransactionNumber(Number(config[ConfigKey.BitcoinSidetreeGenesisBlockNumber]), 0);
  const genesisTimeHash = config[ConfigKey.BitcoinSidetreeGenesisBlockHash];

  const requestHandler = new RequestHandler(uri, prefix, genesisTransactionNumber, genesisTimeHash);

  it('should return the correct response body with height for blocks last request', async () => {
    const expectedResponse: Response = {
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
    const expectedResponse: Response = {
      status: ResponseStatus.Succeeded,
      body: {}
    };

    const fetchedResponse = await requestHandler.handleAnchorRequest("hellow");
    expect(expectedResponse.status).toEqual(fetchedResponse.status);
  });


  it('should return the HTTP 400 for reogranized transactions request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.BadRequest,
      "body": {
        'code': 'invalid_transaction_number_or_time_hash'
      }
    }

    var transactionNumber = new TransactionNumber(1446559, 0);
    var transactionTimeHash = "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber.getTransactionNumber(), transactionTimeHash);
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


    var transactionNumber = new TransactionNumber(1446557, 0);
    var transactionTimeHash = "000000000000005f62979f4e2edf33efffe3148d2d8fec3b9c64d8d8f190fd07";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber.getTransactionNumber(), transactionTimeHash);
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

    var transactionNumber = new TransactionNumber(0, 0);
    transactionNumber.setTransactionNumber(6212927891701760);
    var transactionTimeHash = "000000000000002deb21a9b78c381179bccf84aa7fc0db4e1a0cc37cf46ad199";
    const fetchedResponse = await requestHandler.handleFetchRequest(transactionNumber.getTransactionNumber(), transactionTimeHash);
    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for trace request', async () => {
    const expectedResponse: Response = {
      "status": ResponseStatus.Succeeded,
      "body": {
        "transactions": [
          {
            "transactionNumber": 6212923596734464,
            "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efd",
            "validity": true
          },
          {
            "transactionNumber": 6212923596734464,
            "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe",
            "validity": false
          },
        ]
      }
    };

    const requestBody = {
      "transactions": [
        {
          "transactionNumber": 6212923596734464,
          "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efd",
        },
        {
          "transactionNumber": 6212923596734464,
          "transactionTimeHash": "000000000000ccea9893c38528fd9c96d984b430ba679c6dd6e2a46346865efe",
        },
      ]
    };

    const fetchedResponse = await requestHandler.handleTraceRequest(JSON.stringify(requestBody));
    expect(expectedResponse).toEqual(fetchedResponse);
  });


});