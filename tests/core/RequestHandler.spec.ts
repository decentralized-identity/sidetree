import * as crypto from 'crypto';

import * as createFixture from '../fixtures/create/create.json';
import * as deactivateFixture from '../fixtures/deactivate/deactivate.json';
import * as recoverFixture from '../fixtures/recover/recover.json';
import * as updateFixture from '../fixtures/update/update.json';

import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import BatchScheduler from '../../lib/core/BatchScheduler';
import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Did from '../../lib/core/versions/latest/Did';
import DidState from '../../lib/core/models/DidState';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import Config from '../../lib/core/models/Config';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import JsonAsync from '../../lib/core/versions/latest/util/JsonAsync';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import JwkEs256k from '../../lib/core/models/JwkEs256k';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import MockOperationStore from '../mocks/MockOperationStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Operation from '../../lib/core/versions/latest/Operation';
import OperationGenerator from '../generators/OperationGenerator';
import OperationProcessor from '../../lib/core/versions/latest/OperationProcessor';
import OperationType from '../../lib/core/enums/OperationType';
import RequestHandler from '../../lib/core/versions/latest/RequestHandler';
import Resolver from '../../lib/core/Resolver';
import Response from '../../lib/common/Response';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';
import SidetreeError from '../../lib/common/SidetreeError';

const util = require('util');

describe('RequestHandler', () => {
  // Suppress console logging during testing so we get a compact test summary in console.
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

  let recoveryPublicKey: JwkEs256k;
  let recoveryPrivateKey: JwkEs256k;
  let did: string; // This DID is created at the beginning of every test.
  let didUniqueSuffix: string;

  // Start a new instance of Operation Processor, and create a DID before every test.
  beforeEach(async () => {
    const operationQueue = new MockOperationQueue();
    spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100));
    spyOn(blockchain, 'getWriterValueTimeLock').and.returnValue(Promise.resolve(undefined));

    let versionMetadataFetcher: any = {};
    const versionMetadata = {
      normalizedFeeToPerOperationFeeMultiplier: 0.01
    };
    versionMetadataFetcher = {
      getVersionMetadata: () => {
        return versionMetadata;
      }
    };
    cas = new MockCas();
    const batchWriter = new BatchWriter(operationQueue, blockchain, cas, versionMetadataFetcher);
    const operationProcessor = new OperationProcessor();

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
    [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [signingPublicKey] = await OperationGenerator.generateKeyPair('key2');
    const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey,
      services);
    const createOperation = await CreateOperation.parse(createOperationBuffer);
    didUniqueSuffix = createOperation.didUniqueSuffix;
    did = `did:${didMethodName}:${didUniqueSuffix}`;

    // Test that the create request gets the correct response.
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);
    expect(httpStatus).toEqual(200);
    expect(response).toBeDefined();
    expect(response.body.didDocument.id).toEqual(did);

    // Insert the create operation into DB.
    const namedAnchoredCreateOperationModel: AnchoredOperationModel = {
      didUniqueSuffix: createOperation.didUniqueSuffix,
      type: OperationType.Create,
      transactionNumber: 1,
      transactionTime: 1,
      operationBuffer: createOperationBuffer,
      operationIndex: 0
    };
    await operationStore.put([namedAnchoredCreateOperationModel]);

    // Trigger the batch writing to clear the operation queue for future tests.
    await batchScheduler.writeOperationBatch();
  });

  it('should process create operation from test vectors correctly', async () => {
    const createOperationBuffer = Buffer.from(JSON.stringify(createFixture));
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    expect(response.status).toEqual(ResponseStatus.Succeeded);
  });

  it('should process update operation from test vectors correctly', async () => {
    const updateOperationBuffer = Buffer.from(JSON.stringify(updateFixture));
    const response = await requestHandler.handleOperationRequest(updateOperationBuffer);
    expect(response.status).toEqual(ResponseStatus.Succeeded);
  });

  it('should process recover operation from test vectors correctly', async () => {
    const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverFixture));
    const response = await requestHandler.handleOperationRequest(recoverOperationBuffer);
    expect(response.status).toEqual(ResponseStatus.Succeeded);
  });

  it('should process deactivate operation from test vectors correctly', async () => {
    const deactivateOperationBuffer = Buffer.from(JSON.stringify(deactivateFixture));
    const response = await requestHandler.handleOperationRequest(deactivateOperationBuffer);
    expect(response.status).toEqual(ResponseStatus.Succeeded);
  });

  it('should queue operation request and have it processed by the batch scheduler correctly.', async () => {
    const createOperationData = await OperationGenerator.generateAnchoredCreateOperation({ operationIndex: 1, transactionNumber: 1, transactionTime: 1 });
    const createOperationBuffer = createOperationData.anchoredOperationModel.operationBuffer;
    await requestHandler.handleOperationRequest(createOperationBuffer);

    const blockchainWriteSpy = spyOn(blockchain, 'write');

    await batchScheduler.writeOperationBatch();
    expect(blockchainWriteSpy).toHaveBeenCalledTimes(1);

    // Verify that CAS was invoked to store the chunk file.
    const maxChunkFileSize = 20000000;
    const expectedBatchBuffer = await ChunkFile.createBuffer([createOperationData.createOperation], [], []);
    const expectedChunkFileHash = MockCas.getAddress(expectedBatchBuffer);
    const fetchResult = await cas.read(expectedChunkFileHash, maxChunkFileSize);
    const decompressedData = await Compressor.decompress(fetchResult.content!, maxChunkFileSize);
    const chunkFile = JSON.parse(decompressedData.toString());
    expect(chunkFile.deltas.length).toEqual(1);
  });

  it('should return bad request if delta given in request is larger than protocol limit.', async () => {
    const createOperationData = await OperationGenerator.generateCreateOperation();
    const createOperationRequest = createOperationData.operationRequest;
    const getRandomBytesAsync = util.promisify(crypto.randomBytes);
    const largeBuffer = await getRandomBytesAsync(4000);
    createOperationRequest.delta = Encoder.encode(largeBuffer);

    const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.DeltaExceedsMaximumSize);
  });

  it('should return bad request if two operations for the same DID is received.', async () => {
    // Create the initial create operation.
    const [recoveryPublicKey] = await Jwk.generateEs256kKeyPair();
    const [signingPublicKey] = await OperationGenerator.generateKeyPair('signingKey');
    const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
      recoveryPublicKey,
      signingPublicKey
    );

    // Submit the create request twice.
    await requestHandler.handleOperationRequest(createOperationBuffer);
    const response = await requestHandler.handleOperationRequest(createOperationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.QueueingMultipleOperationsPerDidNotAllowed);
  });

  it('should return a correctly resolved DID Document given a known DID.', async () => {
    const response = await requestHandler.handleResolveRequest(did);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();

    validateDidReferencesInDidDocument(response.body.didDocument, did);
  });

  it('should return a resolved DID Document given a valid long-form DID.', async () => {
    // Create a long-form DID string.
    const createOperationData = await OperationGenerator.generateCreateOperation();
    const didMethodName = 'sidetree';
    const didUniqueSuffix = createOperationData.createOperation.didUniqueSuffix;
    const encodedSuffixData = createOperationData.createOperation.encodedSuffixData;
    const encodedDelta = createOperationData.createOperation.encodedDelta;
    const shortFormDid = `did:${didMethodName}:${didUniqueSuffix}`;
    const longFormDid = `${shortFormDid}?-sidetree-initial-state=${encodedSuffixData}.${encodedDelta}`;

    const response = await requestHandler.handleResolveRequest(longFormDid);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
    expect(response.body).toBeDefined();

    validateDidReferencesInDidDocument(response.body.didDocument, longFormDid);
  });

  it('should return NotFound given an unknown DID.', async () => {
    const response = await requestHandler.handleResolveRequest('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg');
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(404);
    expect(response.body).toEqual({ code: ErrorCode.DidNotFound, message: 'DID Not Found' });
  });

  it('should return BadRequest given a malformed DID.', async () => {
    const response = await requestHandler.handleResolveRequest('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg:unused.');
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(400);
    expect(response.body.code).toEqual(ErrorCode.DidInitialStateValueDoesNotContainTwoParts);
  });

  it('should respond with HTTP 200 when DID deactivate operation request is successful.', async () => {
    const deactivateOperationData = await OperationGenerator.createDeactivateOperation(didUniqueSuffix, recoveryPrivateKey);
    const response = await requestHandler.handleOperationRequest(deactivateOperationData.operationBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when an update operation request is successful.', async () => {
    const [, anySigningPrivateKey] = await Jwk.generateEs256kKeyPair();
    const [additionalKey] = await OperationGenerator.generateKeyPair(`new-key1`);
    const [signingPublicKey] = await OperationGenerator.generateKeyPair('signingKey');
    const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
      didUniqueSuffix, signingPublicKey.jwk, anySigningPrivateKey, additionalKey, OperationGenerator.generateRandomHash()
    );

    const requestBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
    const response = await requestHandler.handleOperationRequest(requestBuffer);
    const httpStatus = Response.toHttpStatus(response.status);

    expect(httpStatus).toEqual(200);
  });

  it('should respond with HTTP 200 when a recover operation request is successful.', async () => {
    const recoveryOperationData = await OperationGenerator.generateRecoverOperation({ didUniqueSuffix, recoveryPrivateKey });
    const response = await requestHandler.handleOperationRequest(recoveryOperationData.operationBuffer);
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

  describe('handleOperationRequest()', async () => {
    it('should return `BadRequest` if unknown error is thrown during generic operation parsing stage.', async () => {
      spyOn(JsonAsync, 'parse').and.throwError('Non-Sidetree error.');

      const response = await requestHandler.handleOperationRequest(Buffer.from('unused'));

      expect(response.status).toEqual(ResponseStatus.BadRequest);
    });

    it('should return `BadRequest` if operation of an unknown type is given.', async () => {
      // Simulate an unknown operation type.
      const mockCreateOperation = (await OperationGenerator.generateCreateOperation()).createOperation;
      (mockCreateOperation as any).type = 'unknownType';
      spyOn(JsonAsync, 'parse').and.returnValue(Promise.resolve('unused'));
      spyOn(Operation, 'parse').and.returnValue(Promise.resolve(mockCreateOperation));

      const response = await requestHandler.handleOperationRequest(Buffer.from('unused'));

      expect(response.status).toEqual(ResponseStatus.BadRequest);
      expect(response.body.code).toEqual(ErrorCode.RequestHandlerUnknownOperationType);
    });

    it('should return `BadRequest` if Sidetree error is thrown during operation processing stage.', async () => {
      // Simulate a Sidetree error thrown when processing operation.
      const mockErrorCode = 'anyCode';
      spyOn(requestHandler as any, 'applyCreateOperation').and.callFake(() => { throw new SidetreeError(mockErrorCode); });

      const operationBuffer = (await OperationGenerator.generateCreateOperation()).createOperation.operationBuffer;
      const response = await requestHandler.handleOperationRequest(operationBuffer);

      expect(response.status).toEqual(ResponseStatus.BadRequest);
      expect(response.body.code).toEqual(mockErrorCode);
    });

    it('should return `ServerError` if non-Sidetree error is thrown during operation processing stage.', async () => {
      // Simulate a non-Sidetree error thrown when processing operation.
      spyOn(requestHandler as any, 'applyCreateOperation').and.throwError('any error');

      const operationBuffer = (await OperationGenerator.generateCreateOperation()).createOperation.operationBuffer;
      const response = await requestHandler.handleOperationRequest(operationBuffer);

      expect(response.status).toEqual(ResponseStatus.ServerError);
    });
  });

  describe('handleCreateRequest()', async () => {
    it('should return `BadRequest` if unable to generate initial DID state from the given create operation model.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const createOperation = createOperationData.createOperation;

      // Simulate undefined being returned by `applyCreateOperation()`.
      spyOn(requestHandler as any, 'applyCreateOperation').and.returnValue(Promise.resolve(undefined));

      const response = await (requestHandler as any).handleCreateRequest(createOperation);

      expect(response.status).toEqual(ResponseStatus.BadRequest);
      done();
    });
  });

  describe('resolveLongFormDid()', async () => {
    it('should return the resolved DID document, and `published` value as `true` if it is resolvable as a registered DID.', async () => {
      const [anySigningPublicKey] = await OperationGenerator.generateKeyPair('anySigningKey');
      const document = {
        publicKeys: [anySigningPublicKey]
      };
      const mockedResolverReturnedDidState: DidState = {
        document,
        lastOperationTransactionNumber: 123,
        nextRecoveryCommitmentHash: 'anyCommitmentHash',
        nextUpdateCommitmentHash: 'anyCommitmentHash'
      };
      spyOn((requestHandler as any).resolver, 'resolve').and.returnValue(Promise.resolve(mockedResolverReturnedDidState));

      const [didState, published] = await (requestHandler as any).resolveLongFormDid('unused');

      expect(published).toEqual(true);
      expect(didState.document.publicKeys.length).toEqual(1);
      expect(didState.document.publicKeys[0].jwk).toEqual(anySigningPublicKey.jwk);
    });
  });
});

/**
 * Verifies that the given DID document contains correct references to the DID throughout.
 */
function validateDidReferencesInDidDocument (didDocument: any, did: string) {
  expect(didDocument.id).toEqual(did);

  if (didDocument.publicKey) {
    for (let publicKeyEntry of didDocument.publicKey) {
      expect(publicKeyEntry.controller).toEqual('');
      expect((publicKeyEntry.id as string).startsWith('#'));
    }
  }

  if (didDocument.service) {
    for (let serviceEntry of didDocument.service) {
      expect((serviceEntry.id as string).startsWith('#'));
    }
  }
}
