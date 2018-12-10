import BatchFile from '../src/BatchFile';
import Logger from '../src/lib/Logger';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import RequestHandler from '../src/RequestHandler';
import Rooter from '../src/Rooter';
import { Cas } from '../src/Cas';
import { Config, ConfigKey } from '../src/Config';
import { createOperationProcessor } from '../src/OperationProcessor';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { initializeProtocol } from '../src/Protocol';
import { readFileSync } from 'fs';
import { toHttpStatus } from '../src/Response';
import { WriteOperation } from '../src/Operation';

describe('RequestHandler', () => {
  initializeProtocol('protocol-test.json');
  Logger.suppressLogging(true);

  // Read create operation request from file.
  const requestString = readFileSync('./tests/requests/create.json');
  const createRequest = Buffer.from(requestString);

  const configFile = require('../json/config.json');
  const config = new Config(configFile);

  const batchFileHash = 'EiAfGFFjyyFUUB0rT52sPFB6CDymiSqFhPSERYQOR7uYwQ'; // This batch file gets create very time rooter.rootOperations() is invoked.
  const did = 'did:sidetree:EiAY3T5CmYdClPgUXp6xpUsH-Pzo-VON8XaJ80nlTh0Jwg'; // This DID is created every time opeartion processor processes the transaction.

  const blockchain = new MockBlockchain();
  let cas: Cas;
  let rooter: Rooter;
  let operationProcessor;
  let requestHandler: RequestHandler;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    cas = new MockCas();
    rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
    operationProcessor = createOperationProcessor(cas, config[ConfigKey.DidMethodName]);
    requestHandler = new RequestHandler(operationProcessor, blockchain, rooter, config[ConfigKey.DidMethodName]);

    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1000000,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    await requestHandler.handleWriteRequest(createRequest);
    await rooter.rootOperations();

    // Now force Operation Processor to process the create operation.
    const resolvedTransaction = {
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: 'NOT_NEEDED',
      anchorFileHash: 'NOT_NEEDED',
      batchFileHash: batchFileHash
    };
    const createOperation = WriteOperation.create(createRequest, resolvedTransaction, 0);
    operationProcessor.process(createOperation);
  });

  it('should handle create operation request.', async () => {
    // NOTE: this is a repeated step already done in beforeEach(),
    // but the same step needed to be in beforeEach() for other tests such as update and delete.
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as DidDocument).id).toEqual(did);

    const blockchainWriteSpy = spyOn(blockchain, 'write');
    expect(rooter.getOperationQueueLength()).toEqual(1);
    await rooter.rootOperations();
    expect(rooter.getOperationQueueLength()).toEqual(0);
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verfiy that CAS was invoked to store the batch file.
    const batchFileBuffer = await cas.read(batchFileHash);
    const batchFile = BatchFile.fromBuffer(batchFileBuffer);
    expect(batchFile.operations.length).toEqual(1);
  });

  it('should return bad request if operation given is larger than protocol limit.', async () => {
    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const blockchainTime = {
      time: 1,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(blockchainTime);

    const createRequest = readFileSync('./tests/requests/create.json');
    const response = await requestHandler.handleWriteRequest(createRequest);
    const httpStatus = toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(400);
  });

  it('should return a DID Document for a known DID given.', async () => {
    const response = await requestHandler.handleResolveRequest(did);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body).id).toEqual(did);
  });

  it('should return NotFound for an unknown DID given.', async () => {
    const response = await requestHandler.handleResolveRequest('did:sidetree:abc123');
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(404);
    expect(response.body).toBeUndefined();
  });

  it('should respond with HTTP 200 when DID is deleted correctly.', async () => {
    const requestString = readFileSync('./tests/requests/delete.json');
    const request = Buffer.from(requestString);

    const response = await requestHandler.handleWriteRequest(request);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 400 when DID given to be deleted does not exist.', async () => {
    const requestString = readFileSync('./tests/requests/delete-unknown-did.json');
    const request = Buffer.from(requestString);

    const response = await requestHandler.handleWriteRequest(request);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.errorCode).toEqual('did_not_found');
  });

  it('should respond with HTTP 200 with the update DID Docuemnt when an update operation is successful.', async () => {
    // Load a request that will delete one of the existing public keys.
    const requestString = readFileSync('./tests/requests/update.json');
    const request = Buffer.from(requestString);

    const response = await requestHandler.handleWriteRequest(request);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);

    // Verify that only one public key is remaining in the response.
    expect(response.body.publicKey.length).toEqual(1);
  });

  it('should respond with HTTP 400 when DID given in an update operation is unknown.', async () => {
    // Load a request that will delete one of the existing public keys.
    const requestString = readFileSync('./tests/requests/update-unknown-did.json');
    const request = Buffer.from(requestString);

    const response = await requestHandler.handleWriteRequest(request);
    const httpStatus = toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.errorCode).toEqual('did_not_found');

  });
});
