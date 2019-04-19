import BatchFile from '../lib/BatchFile';
import BatchWriter from '../lib/BatchWriter';
import Cryptography from '../lib/util/Cryptography';
import Did from '../lib/util/Did';
import IDidPublicKey from '../lib/util/DidPublicKey';
import Encoder from '../lib/Encoder';
import MockBlockchain from '../tests/mocks/MockBlockchain';
import MockCas from '../tests/mocks/MockCas';
import MockOperationStore from './mocks/MockOperationStore';
import Multihash from '../lib/Multihash';
import OperationGenerator from './generators/OperationGenerator';
import OperationProcessor from '../lib/OperationProcessor';
import ProtocolParameters from '../lib/ProtocolParameters';
import RequestHandler from '../lib/RequestHandler';
import { Cas } from '../lib/Cas';
import { OperationStore } from '../lib/OperationStore';
import { IConfig } from '../lib/Config';
import { IDocument } from '../lib/util/Document';
import { Operation } from '../lib/Operation';
import { Response } from '../lib/Response';

describe('RequestHandler', () => {
  const versionsOfProtocolParameters = require('../json/protocol-parameters-test.json');
  ProtocolParameters.initialize(versionsOfProtocolParameters);

  // Surpress console logging during dtesting so we get a compact test summary in console.
  console.info = () => { return; };
  console.error = () => { return; };

  const config: IConfig = require('../json/config-test.json');
  const didMethodName = config.didMethodName;

  // Load the DID Document template.
  const didDocumentTemplate = require('./json/didDocumentTemplate.json');

  const blockchain = new MockBlockchain();
  let cas: Cas;
  let batchWriter: BatchWriter;
  let operationStore: OperationStore;
  let operationProcessor;
  let requestHandler: RequestHandler;

  let publicKey: IDidPublicKey;
  let privateKey: any;
  let did: string; // This DID is created at the beginning of every test.
  let didUniqueSuffix: string;
  let batchFileHash: string;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    cas = new MockCas();
    batchWriter = new BatchWriter(blockchain, cas, config.batchingIntervalInSeconds);
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config.didMethodName, operationStore);

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
    const batchBuffer = BatchFile.fromOperationBuffers([createOperationBuffer]);
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
    const currentHashingAlgorithm = ProtocolParameters.get(currentBlockchainTime.time).hashAlgorithmInMultihashCode;
    didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(createOperation.encodedPayload, currentHashingAlgorithm);
    did = didMethodName + didUniqueSuffix;

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
    const batchFile = JSON.parse(batchFileBuffer.toString());
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
    const hashAlgorithmInMultihashCode = ProtocolParameters.get(currentBlockchainTime.time).hashAlgorithmInMultihashCode;
    const documentHash = Multihash.hash(Buffer.from(encodedOriginalDidDocument), hashAlgorithmInMultihashCode);
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

  it('should respond with HTTP 200 when DID is delete operation request is successful.', async () => {
    const request = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when an update operation rquest is successful.', async () => {
    // Create a request that will delete the 2nd public key.
    const jsonPatch = [{
      op: 'remove',
      path: '/publicKey/1'
    }];

    // Construct update payload.
    const updatePayload = {
      didUniqueSuffix,
      operationNumber: 1,
      patch: jsonPatch,
      previousOperationHash: didUniqueSuffix
    };

    const request = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, publicKey.id, privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });
});
