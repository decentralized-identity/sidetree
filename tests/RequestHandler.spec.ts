import BatchFile from '../src/BatchFile';
import BatchWriter from '../src/BatchWriter';
import Cryptography from '../src/lib/Cryptography';
import Did from '../src/lib/Did';
import DidPublicKey from '../src/lib/DidPublicKey';
import Encoder from '../src/Encoder';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import MockOperationStore from './mocks/MockOperationStore';
import Multihash from '../src/Multihash';
import OperationGenerator from './generators/OperationGenerator';
import OperationProcessor from '../src/OperationProcessor';
import RequestHandler from '../src/RequestHandler';
import { Cas } from '../src/Cas';
import { Config, ConfigKey } from '../src/Config';
import { OperationStore } from '../src/OperationStore';
import { IDocument } from '../src/lib/Document';
import { getProtocol, initializeProtocol } from '../src/Protocol';
import { Operation } from '../src/Operation';
import { Response } from '../src/Response';

describe('RequestHandler', () => {
  initializeProtocol('protocol-test.json');

  // Surpress console logging during dtesting so we get a compact test summary in console.
  console.info = () => { return; };
  console.error = () => { return; };

  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);
  const didMethodName = config[ConfigKey.DidMethodName];

  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  const blockchain = new MockBlockchain();
  let cas: Cas;
  let batchWriter: BatchWriter;
  let operationStore: OperationStore;
  let operationProcessor;
  let requestHandler: RequestHandler;

  let publicKey: DidPublicKey;
  let privateKey: any;
  let did: string; // This DID is created at the beginning of every test.
  let batchFileHash: string;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    cas = new MockCas();
    batchWriter = new BatchWriter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config[ConfigKey.DidMethodName], operationStore);

    requestHandler = new RequestHandler(operationProcessor, blockchain, batchWriter, didMethodName);

    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1000000,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1'); // Generate a unique key-pair used for each test.
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);

    await requestHandler.handleOperationRequest(createOperationBuffer);
    await batchWriter.writeOperationBatch();

    // Generate the batch file and batch file hash.
    const batchBuffer = BatchFile.fromOperations([createOperationBuffer]).toBuffer();
    batchFileHash = MockCas.getAddress(batchBuffer);

    // Now force Operation Processor to process the create operation.
    const resolvedTransaction = {
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: 'NOT_NEEDED',
      anchorFileHash: 'NOT_NEEDED',
      batchFileHash
    };
    const createOperation = Operation.create(createOperationBuffer, resolvedTransaction, 0);
    await operationProcessor.processBatch([createOperation]);

    // NOTE: this is a repeated step already done in beforeEach(),
    // but the same step needed to be in beforeEach() for other tests such as update and delete.
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    const currentBlockchainTime = await blockchain.getLatestTime();
    did = Did.from(createOperation.encodedPayload, didMethodName, getProtocol(currentBlockchainTime.time).hashAlgorithmInMultihashCode);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as IDocument).id).toEqual(did);
  });

  it('should handle create operation request.', async () => {
    const blockchainWriteSpy = spyOn(blockchain, 'write');
    expect(batchWriter.getOperationQueueLength()).toEqual(1);

    await batchWriter.writeOperationBatch();
    expect(batchWriter.getOperationQueueLength()).toEqual(0);
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verfiy that CAS was invoked to store the batch file.
    const batchFileBuffer = await cas.read(batchFileHash);
    const batchFile = await BatchFile.fromBuffer(batchFileBuffer);
    expect(batchFile.operations.length).toEqual(1);
  });

  it('should return bad request if operation given is larger than protocol limit.', async () => {
    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const blockchainTime = {
      time: 1,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(blockchainTime);

    const createRequest = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
    const response = await requestHandler.handleOperationRequest(createRequest);
    const httpStatus = Response.toHttpStatus(response.status);

    // TODO: more validations needed as implementation becomes more complete.
    expect(httpStatus).toEqual(400);
  });

  it('should return a resolved DID Document given a known DID.', async () => {
    const response = await requestHandler.handleResolveRequest(did);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body).id).toEqual(did);
  });

  it('should return a resolved DID Document given a valid encoded original DID Document for resolution.', async () => {
    // Create an original DID Document.
    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1');
    const originalDidDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: [publicKey]
    };
    const encodedOriginalDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
    const currentBlockchainTime = await blockchain.getLatestTime();
    const documentHash = Multihash.hash(Buffer.from(encodedOriginalDidDocument), getProtocol(currentBlockchainTime.time).hashAlgorithmInMultihashCode);
    const expectedDid = didMethodName + Encoder.encode(documentHash);
    const response = await requestHandler.handleResolveRequest(didMethodName + encodedOriginalDidDocument);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body).id).toEqual(expectedDid);
  });

  it('should return NotFound given an unknown DID.', async () => {
    const response = await requestHandler.handleResolveRequest('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg');
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(404);
    expect(response.body).toBeUndefined();
  });

  it('should return BadRequest given a malformed DID.', async () => {
    const response = await requestHandler.handleResolveRequest('did:sidetree:abc123');
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body).toBeUndefined();
  });

  it('should respond with HTTP 200 when DID is deleted correctly.', async () => {
    const request = await OperationGenerator.generateDeleteOperation(did);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 400 when DID given to be deleted does not exist.', async () => {
    const request = await OperationGenerator.generateDeleteOperation(didMethodName + 'nonExistentDid');
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.errorCode).toEqual('did_not_found');
  });

  it('should respond with HTTP 200 with the update DID Docuemnt when an update operation is successful.', async () => {
    // Create a request that will delete the 2nd public key.
    const jsonPatch = [{
      op: 'remove',
      path: '/publicKey/1'
    }];

    // Construct update payload.
    const updatePayload = {
      did,
      operationNumber: 1,
      patch: jsonPatch,
      previousOperationHash: Did.getUniqueSuffix(did)
    };

    const request = await OperationGenerator.generateUpdateOperation(updatePayload, publicKey.id, privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);

    // Verify that only one public key is remaining in the response.
    expect(response.body.publicKey.length).toEqual(1);
  });

  it('should respond with HTTP 400 when DID given in an update operation is unknown.', async () => {
    // Create a JSON patch that will delete the 2nd public key.
    const jsonPatch = [{
      op: 'remove',
      path: '/publicKey/1'
    }];

    // Construct update payload.
    const updatePayload = {
      did: didMethodName + 'nonExistentDid',
      operationNumber: 1,
      patch: jsonPatch,
      previousOperationHash: Did.getUniqueSuffix(did)
    };

    const request = await OperationGenerator.generateUpdateOperation(updatePayload, publicKey.id, privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.errorCode).toEqual('did_not_found');

  });
});
