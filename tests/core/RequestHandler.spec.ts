import * as crypto from 'crypto';
import AnchoredOperation from '../../lib/core/versions/latest/AnchoredOperation';
import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import BatchFile from '../../lib/core/versions/latest/BatchFile';
import BatchScheduler from '../../lib/core/BatchScheduler';
import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Did from '../../lib/core/versions/latest/Did';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import DidServiceEndpoint from '../common/DidServiceEndpoint';
import Document from '../../lib/core/versions/latest/Document';
import DocumentModel from '../../lib/core/versions/latest/models/DocumentModel';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Config from '../../lib/core/models/Config';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import RequestHandler from '../../lib/core/versions/latest/RequestHandler';
import Resolver from '../../lib/core/Resolver';
import util = require('util');
import { Response, ResponseStatus } from '../../lib/common/Response';

describe('RequestHandler', () => {
  // Surpress console logging during dtesting so we get a compact test summary in console.
  console.info = () => { return; };
  console.error = () => { return; };
  console.debug = () => { return; };

  const config: Config = require('../json/config-test.json');
  const didMethodName = config.didMethodName;

  // Load the DID Document template.
  const blockchain = new MockBlockchain();
  let cas: ICas;
  let batchScheduler: BatchScheduler;
  let operationStore: IOperationStore;
  let resolver: Resolver;
  let requestHandler: RequestHandler;
  let versionManager: IVersionManager;

  let recoveryPublicKey: DidPublicKeyModel;
  let recoveryPrivateKey: any;
  let did: string; // This DID is created at the beginning of every test.
  let didUniqueSuffix: string;
  let batchFileHash: string;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    const operationQueue = new MockOperationQueue();
    spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100));

    cas = new MockCas();
    const batchWriter = new BatchWriter(operationQueue, blockchain, cas, 0);
    const operationProcessor = new OperationProcessor(config.didMethodName);

    versionManager = new MockVersionManager();
    spyOn(versionManager, 'getOperationProcessor').and.returnValue(operationProcessor);
    spyOn(versionManager, 'getBatchWriter').and.returnValue(batchWriter);

    operationStore = new MockOperationStore();
    resolver = new Resolver(versionManager, operationStore);
    batchScheduler = new BatchScheduler(versionManager, blockchain, config.batchingIntervalInSeconds);
    requestHandler = new RequestHandler(
      resolver,
      operationQueue,
      didMethodName
    );

    // Set a latest time that must be able to resolve to a protocol version in the protocol config file used.
    const mockLatestTime = {
      time: 1000000,
      hash: 'dummyHash'
    };

    blockchain.setLatestTime(mockLatestTime);

    // Generate a unique key-pair used for each test.
    [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
    const nextRecoveryOtpHash = Multihash.hash(Buffer.from('hardCodedRecoveryOtp'), 18); // 18 = SHA256;
    const nextUpdateOtpHash = Multihash.hash(Buffer.from('hardCodedUpdateOtp'), 18); // 18 = SHA256;
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      recoveryPrivateKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash,
      services);

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

    // NOTE: this is a repeated step already done in beforeEach() earlier,
    // but the same step needed to be in beforeEach() for other tests such as update and delete.
    // Issue #325 - Remove the need for calling `handleOperationRequest()` twice in `beforeEach()`
    // and `batchScheduler.writeOperationBatch()` in multiple tests.
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
    const getRandomBytesAsync = util.promisify(crypto.randomBytes);
    const largeBuffer = await getRandomBytesAsync(4000);
    const response = await requestHandler.handleOperationRequest(largeBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.OperationExceedsMaximumSize);
  });

  it('should return bad request if two operations for the same DID is received.', async () => {
    // Create the initial create operation.
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#recoveryKey', KeyUsage.recovery);
    const [signingPublicKey] = await Cryptography.generateKeyPairHex('#signingKey', KeyUsage.signing);
    const nextRecoveryOtpHash = Multihash.hash(Buffer.from('hardCodedRecoveryOtp'), 18); // 18 = SHA256;
    const nextUpdateOtpHash = Multihash.hash(Buffer.from('hardCodedUpdateOtp'), 18); // 18 = SHA256;
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      recoveryPrivateKey,
      signingPublicKey,
      nextRecoveryOtpHash,
      nextUpdateOtpHash
    );

    // Submit the create request twice.
    await requestHandler.handleOperationRequest(createOperationBuffer);
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.QueueingMultipleOperationsPerDidNotAllowed);
  });

  it('should return a resolved DID Document given a known DID.', async () => {
    const response = await requestHandler.handleResolveRequest(did);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();
    expect((response.body).id).toEqual(did);
  });

  it('should return a resolved DID Document given a valid long-form DID.', async () => {
    // Create an original DID Document.
    const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
    const originalDidDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: [recoveryPublicKey, signingPublicKey]
    };
    const encodedOriginalDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
    const hashAlgorithmInMultihashCode = 18;
    const documentHash = Multihash.hash(Buffer.from(encodedOriginalDidDocument), hashAlgorithmInMultihashCode);
    const expectedDid = didMethodName + Encoder.encode(documentHash);

    const longFormDid = Did.createLongFormDidString(didMethodName, originalDidDocument, hashAlgorithmInMultihashCode);
    const response = await requestHandler.handleResolveRequest(longFormDid);
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
    const response = await requestHandler.handleResolveRequest('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg;bad-request-param=bad-input');
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.DidLongFormOnlyInitialValuesParameterIsAllowed);
  });

  it('should respond with HTTP 200 when DID is delete operation request is successful.', async () => {
    // write operation batch to prevent the violation of 1 operation per DID per batch rule.
    await batchScheduler.writeOperationBatch();
    const recoveryOtp = Encoder.encode(Buffer.from('unusedRecoveryOtp'));
    const request = await OperationGenerator.generateDeleteOperationBuffer(didUniqueSuffix, recoveryOtp, '#key1', recoveryPrivateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when an update operation request is successful.', async () => {
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
      patches,
      updateOtp: 'EiD_UnusedUpdateOneTimePassword_AAAAAAAAAAAAAA',
      nextUpdateOtpHash: 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA'
    };

    const request = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, recoveryPublicKey.id, recoveryPrivateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when a recover operation request is successful.', async () => {
    // write operation batch to prevent the violation of 1 operation per DID per batch rule.
    await batchScheduler.writeOperationBatch();

    // Create new keys used for new document for recovery request.
    const [newRecoveryPublicKey] = await Cryptography.generateKeyPairHex('#newRecoveryKey', KeyUsage.recovery);
    const [newSigningPublicKey] = await Cryptography.generateKeyPairHex('#newSigningKey', KeyUsage.signing);
    const newServiceEndpoint = DidServiceEndpoint.createHubServiceEndpoint(['newDummyHubUri1', 'newDummyHubUri2']);

    // Create the recover payload.
    const newDocumentModel = Document.create([newRecoveryPublicKey, newSigningPublicKey], [newServiceEndpoint]);
    const recoverPayload = {
      didUniqueSuffix,
      recoveryOtp: 'EiD_UnusedRecoveryOneTimePassword_AAAAAAAAAAAA',
      newDidDocument: newDocumentModel,
      nextRecoveryOtpHash: 'EiD_UnusedNextRecoveryOneTimePasswordHash_AAAA',
      nextUpdateOtpHash: 'EiD_UnusedNextUpdateOneTimePasswordHash_AAAAAA'
    };

    const request = await OperationGenerator.createOperationBuffer(OperationType.Recover, recoverPayload, recoveryPublicKey.id, recoveryPrivateKey);
    const response = await requestHandler.handleOperationRequest(request);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  describe('handleResolveRequest()', async () => {
    it('should return internal server error if non-Sidetree error has occurred.', async () => {
      spyOn(Did, 'create').and.throwError('Non-Sidetree error.');

      const response = await requestHandler.handleResolveRequest('unused');

      expect(response.status).toEqual(ResponseStatus.ServerError);
    });
  });

  describe('handleResolveRequestWithLongFormDid()', async () => {
    it('should return the resolved DID document if it is resolvable as a registered DID.', async () => {
      const resolverOverriddenReturnValue = 'overridden value';
      spyOn((requestHandler as any).resolver, 'resolve').and.returnValue(Promise.resolve(resolverOverriddenReturnValue));

      const response = await (requestHandler as any).handleResolveRequestWithLongFormDid('unused');

      expect(response.body).toEqual(resolverOverriddenReturnValue);
    });
  });
});
