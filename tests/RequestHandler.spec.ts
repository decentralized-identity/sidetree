import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import RequestHandler from '../src/RequestHandler';
import Rooter from '../src/Rooter';
import { Config, ConfigKey } from '../src/Config';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { readFileSync } from 'fs';
import { toHttpStatus } from '../src/Response';

describe('RequestHandler', () => {
  // Component dependency initialization & injection.
  const configFile = require('../json/config.json');
  const config = new Config(configFile);
  const blockchain = new MockBlockchain();
  const cas = new MockCas();
  const rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
  const requestHandler = new RequestHandler(blockchain, rooter, config[ConfigKey.DidMethodName]);

  it('should handle create operation request.', async () => {
    // Set a last block that must be able to resolve to a protocol version in the protocol config file used.
    const mockLastBlock ={
      blockNumber: 1000000,
      blockHash: "dummyHash"
    }
    blockchain.setLaskBlock(mockLastBlock);

    const createRequest = readFileSync('./tests/requests/create.json');
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as DidDocument).id).toEqual('did:sidetree:QmcVuf9R2Ma8PfsBGrJDcvbNGybi7h22c9nM98fBSaLXkF');


    const blockchainWriteSpy = spyOn(blockchain, 'write');
    expect(rooter.getOperationQueueLength()).toEqual(1);
    await rooter.rootOperations();
    expect(rooter.getOperationQueueLength()).toEqual(0);
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);
  });

  it('should return bad request if operation given is larger than protocol limit.', async () => {
    // Set a last block that must be able to resolve to a protocol version in the protocol config file used.
    const mockLastBlock ={
      blockNumber: 1,
      blockHash: "dummyHash"
    }
    blockchain.setLaskBlock(mockLastBlock);

    const createRequest = readFileSync('./tests/requests/create.json');
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(400);
  });
});
