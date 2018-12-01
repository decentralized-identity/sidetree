import BatchFile from '../src/BatchFile';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import RequestHandler from '../src/RequestHandler';
import Rooter from '../src/Rooter';
import { Config, ConfigKey } from '../src/Config';
import { createOperationProcessor } from '../src/OperationProcessor';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { readFileSync } from 'fs';
import { toHttpStatus } from '../src/Response';
import { WriteOperation } from '../src/Operation';

describe('RequestHandler', () => {
  // Component dependency initialization & injection.
  const configFile = require('../json/config.json');
  const config = new Config(configFile);
  const blockchain = new MockBlockchain();
  const cas = new MockCas();
  const rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
  const operationProcessor = createOperationProcessor(cas, config[ConfigKey.DidMethodName]);
  const requestHandler = new RequestHandler(operationProcessor, blockchain, rooter, config[ConfigKey.DidMethodName]);

  it('should handle create operation request.', async () => {
    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1000000,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    // Read create operation request from file.
    const requestString = readFileSync('./tests/requests/create.json');
    const createRequest = Buffer.from(requestString);

    // Handle request.
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as DidDocument).id).toEqual('did:sidetree:QmU1EDCnXdeEWvZpBWkhvavZMeWKHYACuQNAihbccAkEQy');

    const blockchainWriteSpy = spyOn(blockchain, 'write');
    expect(rooter.getOperationQueueLength()).toEqual(1);
    await rooter.rootOperations();
    expect(rooter.getOperationQueueLength()).toEqual(0);
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verfiy that CAS was invoked to store the batch file.
    const batchFileBuffer = await cas.read('0');
    const batchFile = BatchFile.fromBuffer(batchFileBuffer);
    expect(batchFile.operations.length).toEqual(1);

    // Now force Operation Processor to process the create operation.
    const resolvedTransaction = {
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: 'NOT_NEEDED',
      anchorFileHash: 'NOT_NEEDED',
      batchFileHash: '0'
    };
    const createOperation = WriteOperation.create(createRequest, resolvedTransaction, 0);
    operationProcessor.process(createOperation);
  });

  it('should return bad request if operation given is larger than protocol limit.', async () => {
    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    const createRequest = readFileSync('./tests/requests/create.json');
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(400);
  });

  it('should return a DID Document for a known DID given.', async () => {
    const did = 'did:sidetree:QmU1EDCnXdeEWvZpBWkhvavZMeWKHYACuQNAihbccAkEQy';
    const response = await requestHandler.handleResolveRequest(did);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body as any).id).toEqual(did);
  });

  it('should return NotFound for an unknown DID given.', async () => {

    const response = await requestHandler.handleResolveRequest('did:sidetree:abc123');
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(404);
    expect(response.body).toBeUndefined();
  });
});
