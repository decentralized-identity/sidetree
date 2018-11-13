import BatchFile from '../src/BatchFile';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import MockDidCache from './mocks/MockOperationProcessor';
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
  const operationProcessor = new MockDidCache();
  const requestHandler = new RequestHandler(operationProcessor, blockchain, rooter, config[ConfigKey.DidMethodName]);

  it('should handle create operation request.', async () => {
    // Set a last block that must be able to resolve to a protocol version in the protocol config file used.
    const mockLastBlock = {
      blockNumber: 1000000,
      blockHash: 'dummyHash'
    };

    blockchain.setLaskBlock(mockLastBlock);

    // Read create operation request from file.
    const requestString = readFileSync('./tests/requests/create.json');
    const createRequest = Buffer.from(requestString);

    // Handle request.
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as DidDocument).id).toEqual('did:sidetree:QmS68zcuDEcKMXJrH7vyvmkmK5dBc9y8kXLfZKNBJKYvMY');

    const blockchainWriteSpy = spyOn(blockchain, 'write');
    expect(rooter.getOperationQueueLength()).toEqual(1);
    await rooter.rootOperations();
    expect(rooter.getOperationQueueLength()).toEqual(0);
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verfiy that CAS was invoked to store the batch file.
    const batchFileBuffer = await cas.read('0');
    const batchFile = BatchFile.fromBuffer(batchFileBuffer);
    expect(batchFile.operations.length).toEqual(1);
  });

  it('should return bad request if operation given is larger than protocol limit.', async () => {
    // Set a last block that must be able to resolve to a protocol version in the protocol config file used.
    const mockLastBlock = {
      blockNumber: 1,
      blockHash: 'dummyHash'
    };

    blockchain.setLaskBlock(mockLastBlock);

    const createRequest = readFileSync('./tests/requests/create.json');
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(400);
  });

  it('should return a DID Document for a known DID given.', async () => {
    const didDocumentString = `{
      "@context": "https://w3id.org/did/v1",
      "id": "did:sidetree:abc123"
    }`;
    const didDocumentJson = JSON.parse(didDocumentString);
    const didDocument = new DidDocument(didDocumentJson);
    operationProcessor.setResolveReturnValue(didDocument);

    const response = await requestHandler.handleResolveRequest('did:sidetree:abc123');
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body as any).id).toEqual('did:sidetree:abc123');
  });

  it('should return NotFound for an unknown DID given.', async () => {
    operationProcessor.setResolveReturnValue(undefined);

    const response = await requestHandler.handleResolveRequest('did:sidetree:abc123');
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(404);
    expect(response.body).toBeUndefined();
  });
});
