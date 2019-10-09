import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import BatchFile from '../../lib/core/versions/latest/BatchFile';
import BatchScheduler from '../../lib/core/BatchScheduler';
import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Did from '../../lib/core/versions/latest/Did';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Config from '../../lib/core/models/Config';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import MockOperationStore from '../mocks/MockOperationStore';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import RequestHandler from '../../lib/core/versions/latest/RequestHandler';
import Resolver from '../../lib/core/Resolver';
import { Response } from '../../lib/common/Response';

describe('RequestHandler', () => {
  // Surpress console logging during dtesting so we get a compact test summary in console.
  console.info = () => { return; };
  console.error = () => { return; };

  const config: Config = require('../json/config-test.json');
  const didMethodName = config.didMethodName;

  // Load the DID Document template.
  const didDocumentTemplate = require('../json/didDocumentTemplate.json');

  const blockchain = new MockBlockchain();
  let cas: ICas;
  let batchScheduler: BatchScheduler;
  let operationStore: IOperationStore;
  let resolver: Resolver;
  let requestHandler: RequestHandler;

  let publicKey: DidPublicKeyModel;
  let privateKey: any;
  let did: string; // This DID is created at the beginning of every test.
  let didUniqueSuffix: string;
  let batchFileHash: string;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    const allSupportedHashAlgorithms = [18];
    const operationQueue = new MockOperationQueue();

    cas = new MockCas();
    const batchWriter = new BatchWriter(operationQueue, blockchain, cas);

    operationStore = new MockOperationStore();
    resolver = new Resolver((_blockchainTime) => new OperationProcessor(config.didMethodName), operationStore);
    batchScheduler = new BatchScheduler((_blockchainTime) => batchWriter, blockchain, config.batchingIntervalInSeconds);
    requestHandler = new RequestHandler(
      resolver,
      operationQueue,
      didMethodName,
      allSupportedHashAlgorithms
    );

    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1000000,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    [publicKey, privateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery); // Generate a unique key-pair used for each test.
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);

    await requestHandler.handleOperationRequest(createOperationBuffer);
    await batchScheduler.writeOperationBatch();

    // Generate the batch file and batch file hash.
    const batchBuffer = await BatchFile.fromOperationBuffers([createOperationBuffer]);
    batchFileHash = MockCas.getAddress(batchBuffer);

    // Now force Operation Processor to process the create operation.
    const anchoredOperationModel: AnchoredOperationModel = {
      transactionNumber: 1,
      transactionTime: 1,
      operationBuffer: createOperationBuffer,
      operationIndex: 0
    };
    const createOperation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
    await operationStore.put([createOperation]);

    // NOTE: this is a repeated step already done in beforeEach(),
    // but the same step needed to be in beforeEach() for other tests such as update and delete.
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    const currentHashingAlgorithm = 18;
    didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(createOperation.encodedPayload, currentHashingAlgorithm);
    did = didMethodName + didUniqueSuffix;

    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect((response.body as DocumentModel).id).toEqual(did);
  });

  it('should handle create operation request.', async () => {
    const blockchainWriteSpy = spyOn(blockchain, 'write');

    await batchScheduler.writeOperationBatch();
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verfiy that CAS was invoked to store the batch file.
    const maxBatchFileSize = 20000000;
    const fetchResult = await cas.read(batchFileHash, maxBatchFileSize);
    const decompressedData = await Compressor.decompress(fetchResult.content!);
    const batchFile = JSON.parse(decompressedData.toString());
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
    let recoveryPublicKey: DidPublicKeyModel;
    let signingPublicKey: DidPublicKeyModel;
    [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    [signingPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.signing);
    const originalDidDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: [recoveryPublicKey, signingPublicKey]
    };
    const encodedOriginalDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
    const hashAlgorithmInMultihashCode = 18;
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
    // write operation batch to prevent the violation of 1 operation per DID per batch rule.
    await batchScheduler.writeOperationBatch();
    const request = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, '#key1', privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when an update operation rquest is successful.', async () => {
    // write operation batch to prevent the violation of 1 operation per DID per batch rule.
    await batchScheduler.writeOperationBatch();

    // Create a request that will delete the 2nd public key.
    const patches = [
      {
        action: 'remove-public-keys',
        publicKeys: ['#key1', '#key2']
      }
    ];

    // Construct update payload.
    const updatePayload = {
      didUniqueSuffix,
      previousOperationHash: didUniqueSuffix,
      patches
    };

    const request = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, publicKey.id, privateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });
});
