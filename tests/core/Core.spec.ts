import Core from '../../lib/core/Core';
import IRequestHandler from '../../lib/core/interfaces/IRequestHandler';
import ResponseModel from '../../lib/common/models/ResponseModel';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';

describe('Core', async () => {

  const testConfig = require('../json/bitcoin-config-test.json');
  const testVersionConfig = require('../json/core-protocol-versioning-test.json');

  const resolvedRequest: Promise<ResponseModel> = new Promise(resolve => {
    const responseModel: ResponseModel = { status: ResponseStatus.Succeeded, body: null };
    resolve(responseModel);
  });

  describe('constructor', () => {
    it('should construct with the minimal test configuration', () => {
      // remove the optional parameter "databaseName"
      const minimalConfig = Object.assign({}, testConfig);
      delete minimalConfig.databaseName;
      const core = new Core(minimalConfig, testVersionConfig);
      expect(core).toBeDefined();
      // test default database name
      expect(core['operationStore']['databaseName']).toEqual('sidetree');
    });

    it('should construct MongoDBOperationStore with database if passed in config', () => {
      const databaseName = 'mongoDbTestDatabase';
      const databaseIncludedConfig = Object.assign({}, testConfig, { databaseName });
      const core = new Core(databaseIncludedConfig, testVersionConfig);
      expect(core['operationStore']['databaseName']).toEqual(databaseName);
    });
  });

  describe('initialize', async () => {
    it('should initialize all required dependencies', async () => {
      const core = new Core(testConfig, testVersionConfig);
      const transactionStoreInitSpy = spyOn(core['transactionStore'], 'initialize');
      const unresolvableTransactionStoreInitSpy = spyOn(core['unresolvableTransactionStore'], 'initialize');
      const operationStoreInitSpy = spyOn(core['operationStore'], 'initialize');
      const blockchainInitSpy = spyOn(core['blockchain'], 'initialize');
      const versionManagerInitSpy = spyOn(core['versionManager'], 'initialize');
      const observerStartSpy = spyOn(core['observer'], 'startPeriodicProcessing');
      const batchSchedulerStartSpy = spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      const blockchainStartSpy = spyOn(core['blockchain'], 'startPeriodicCachedBlockchainTimeRefresh');
      const downloadManagerStartSpy = spyOn(core['downloadManager'], 'start');
      await core.initialize();
      expect(transactionStoreInitSpy).toHaveBeenCalled();
      expect(unresolvableTransactionStoreInitSpy).toHaveBeenCalled();
      expect(operationStoreInitSpy).toHaveBeenCalled();
      expect(blockchainInitSpy).toHaveBeenCalled();
      expect(versionManagerInitSpy).toHaveBeenCalled();
      expect(observerStartSpy).toHaveBeenCalled();
      expect(batchSchedulerStartSpy).toHaveBeenCalled();
      expect(blockchainStartSpy).toHaveBeenCalled();
      expect(downloadManagerStartSpy).toHaveBeenCalled();

    });
  });

  describe('handleGetVersionRequest()', async () => {
    it('should call all the dependent services', async () => {

      // Keep the 'name' property on the following model objects. The name is used to sort
      // the values alphabetically to validate the response later on.
      const expectedCoreVersion: ServiceVersionModel = { name: 'a-service', version: 'x.y.z' };
      const expectedBlockchainVersion: ServiceVersionModel = { name: 'b-service', version: 'a.b.c' };
      const expectedCasVersion: ServiceVersionModel = { name: 'c-service', version: '1.x.c' };

      const core = new Core(testConfig, testVersionConfig);

      const serviceInfoSpy = spyOn(core['serviceInfo'], 'getServiceVersion').and.returnValue(expectedCoreVersion);
      const blockchainSpy = spyOn(core['blockchain'], 'getServiceVersion').and.returnValue(Promise.resolve(expectedBlockchainVersion));
      const casSpy = spyOn(core['cas'], 'getServiceVersion').and.returnValue(Promise.resolve(expectedCasVersion));

      const fetchedResponse = await core.handleGetVersionRequest();

      expect(serviceInfoSpy).toHaveBeenCalled();
      expect(blockchainSpy).toHaveBeenCalled();
      expect(casSpy).toHaveBeenCalled();
      expect(fetchedResponse.status).toEqual(ResponseStatus.Succeeded);

      // Sort the output to make it easier to validate
      let fetchedVersions: ServiceVersionModel[] = JSON.parse(fetchedResponse.body);
      fetchedVersions.sort((a, b) => a.name > b.name ? 1 : -1);

      expect(fetchedVersions[0]).toEqual(expectedCoreVersion);
      expect(fetchedVersions[1]).toEqual(expectedBlockchainVersion);
      expect(fetchedVersions[2]).toEqual(expectedCasVersion);
    });
  });

  describe('handleResolveRequest', () => {
    it('should call the needed functions and return a response', async () => {
      const core = new Core(testConfig, testVersionConfig);
      const mockRequestHandler = jasmine.createSpyObj<IRequestHandler>('versionManagerSpy', ['handleResolveRequest']);
      mockRequestHandler.handleResolveRequest.and.callFake(() => { return resolvedRequest; });
      core['versionManager']['getRequestHandler'] = () => { return mockRequestHandler; };
      core['blockchain']['cachedBlockchainTime'] = { time: Number.MAX_SAFE_INTEGER, hash: 'hash' };
      const response = await core.handleResolveRequest('did:sidetree:abc');
      expect(mockRequestHandler.handleResolveRequest).toHaveBeenCalled();
      expect(response).toEqual({ status: ResponseStatus.Succeeded, body: null });
    });
  });

  describe('handleOperationRequest', () => {
    it('should call the needed functions and return a response', async () => {
      const core = new Core(testConfig, testVersionConfig);
      const mockRequestHandler = jasmine.createSpyObj<IRequestHandler>('versionManagerSpy', ['handleOperationRequest']);
      mockRequestHandler.handleOperationRequest.and.callFake(() => { return resolvedRequest; });
      core['versionManager']['getRequestHandler'] = () => { return mockRequestHandler; };
      core['blockchain']['cachedBlockchainTime'] = { time: Number.MAX_SAFE_INTEGER, hash: 'hash' };
      const response = await core.handleOperationRequest(Buffer.from('some string'));
      expect(mockRequestHandler.handleOperationRequest).toHaveBeenCalled();
      expect(response).toEqual({ status: ResponseStatus.Succeeded, body: null });
    });
  });
});
