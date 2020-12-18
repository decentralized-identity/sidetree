import Config from '../../lib/core/models/Config';
import Core from '../../lib/core/Core';
import EventEmitter from '../../lib/common/EventEmitter';
import IRequestHandler from '../../lib/core/interfaces/IRequestHandler';
import Logger from '../../lib/common/Logger';
import MockCas from '../mocks/MockCas';
import ResponseModel from '../../lib/common/models/ResponseModel';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';

describe('Core', async () => {

  const testConfig = require('../json/config-test.json');
  const testVersionConfig = require('../json/core-protocol-versioning-test.json');

  const mockCas = new MockCas();

  const resolvedRequest: Promise<ResponseModel> = new Promise(resolve => {
    const responseModel: ResponseModel = { status: ResponseStatus.Succeeded, body: null };
    resolve(responseModel);
  });

  describe('constructor', () => {
    it('should construct MongoDBOperationStore with database if passed in config', () => {
      const databaseName = 'mongoDbTestDatabase';
      const databaseIncludedConfig = Object.assign({}, testConfig, { databaseName });
      const core = new Core(databaseIncludedConfig, testVersionConfig, mockCas);
      expect(core['operationStore']['databaseName']).toEqual(databaseName);
      expect(core['transactionStore']['databaseName']).toEqual(databaseName);
      expect(core['unresolvableTransactionStore']['databaseName']).toEqual(databaseName);
    });
  });

  describe('initialize', async () => {
    it('should initialize all required dependencies', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);
      const serviceStateStoreInitializeSpy = spyOn(core['serviceStateStore'], 'initialize');
      const transactionStoreInitSpy = spyOn(core['transactionStore'], 'initialize');
      const unresolvableTransactionStoreInitSpy = spyOn(core['unresolvableTransactionStore'], 'initialize');
      const operationStoreInitSpy = spyOn(core['operationStore'], 'initialize');
      const upgradeDatabaseIfNeededSpy = spyOn(core as any, 'upgradeDatabaseIfNeeded');
      const blockchainInitSpy = spyOn(core['blockchain'], 'initialize');
      const versionManagerInitSpy = spyOn(core['versionManager'], 'initialize');
      const observerStartSpy = spyOn(core['observer'], 'startPeriodicProcessing');
      const batchSchedulerStartSpy = spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      const blockchainStartSpy = spyOn(core['blockchain'], 'startPeriodicCachedBlockchainTimeRefresh');
      const downloadManagerStartSpy = spyOn(core['downloadManager'], 'start');
      await core.initialize();
      expect(serviceStateStoreInitializeSpy).toHaveBeenCalled();
      expect(transactionStoreInitSpy).toHaveBeenCalled();
      expect(unresolvableTransactionStoreInitSpy).toHaveBeenCalled();
      expect(operationStoreInitSpy).toHaveBeenCalled();
      expect(upgradeDatabaseIfNeededSpy).toHaveBeenCalled();
      expect(blockchainInitSpy).toHaveBeenCalled();
      expect(versionManagerInitSpy).toHaveBeenCalled();
      expect(observerStartSpy).toHaveBeenCalled();
      expect(batchSchedulerStartSpy).toHaveBeenCalled();
      expect(blockchainStartSpy).toHaveBeenCalled();
      expect(downloadManagerStartSpy).toHaveBeenCalled();
    });

    it('should override the default logger/event emitter if custom logger/event emitter is given.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      spyOn(core['serviceStateStore'], 'initialize');
      spyOn(core['transactionStore'], 'initialize');
      spyOn(core['unresolvableTransactionStore'], 'initialize');
      spyOn(core['operationStore'], 'initialize');
      spyOn(core as any, 'upgradeDatabaseIfNeeded');
      spyOn(core['blockchain'], 'initialize');
      spyOn(core['versionManager'], 'initialize');
      spyOn(core['observer'], 'startPeriodicProcessing');
      spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      spyOn(core['blockchain'], 'startPeriodicCachedBlockchainTimeRefresh');
      spyOn(core['downloadManager'], 'start');

      let customLoggerInvoked = false;
      const customLogger = {
        info: () => { customLoggerInvoked = true; },
        warn: () => { },
        error: () => { }
      };

      let customEvenEmitterInvoked = false;
      const customEvenEmitter = {
        emit: async () => { customEvenEmitterInvoked = true; }
      };

      await core.initialize(customLogger, customEvenEmitter);

      // Invoke logger to trigger the custom logger's method defined above.
      Logger.info('anything');

      // Invoke event emitter to trigger the custom emitter's method defined above.
      await EventEmitter.emit('anything');

      expect(customLoggerInvoked).toBeTruthy();
      expect(customEvenEmitterInvoked).toBeTruthy();
    });

    it('should not start the Batch Writer and Observer if they are disabled.', async () => {
      // Disable Batch Writer and observer in config.
      const config = Object.assign({}, testConfig) as Config;
      config.batchingIntervalInSeconds = 0;
      config.observingIntervalInSeconds = 0;

      const core = new Core(config, testVersionConfig, mockCas);
      const observerStartSpy = spyOn(core['observer'], 'startPeriodicProcessing');
      const batchSchedulerStartSpy = spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      spyOn(core['serviceStateStore'], 'initialize');
      spyOn(core['transactionStore'], 'initialize');
      spyOn(core['unresolvableTransactionStore'], 'initialize');
      spyOn(core['operationStore'], 'initialize');
      spyOn(core as any, 'upgradeDatabaseIfNeeded');
      spyOn(core['blockchain'], 'initialize');
      spyOn(core['versionManager'], 'initialize');
      spyOn(core['blockchain'], 'startPeriodicCachedBlockchainTimeRefresh');
      spyOn(core['downloadManager'], 'start');

      await core.initialize();
      expect(observerStartSpy).not.toHaveBeenCalled();
      expect(batchSchedulerStartSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleGetVersionRequest()', async () => {
    it('should call all the dependent services', async () => {

      // Keep the 'name' property on the following model objects. The name is used to sort
      // the values alphabetically to validate the response later on.
      const expectedCoreVersion: ServiceVersionModel = { name: 'a-service', version: 'x.y.z' };
      const expectedBlockchainVersion: ServiceVersionModel = { name: 'b-service', version: 'a.b.c' };

      const core = new Core(testConfig, testVersionConfig, mockCas);

      const serviceInfoSpy = spyOn(core['serviceInfo'], 'getServiceVersion').and.returnValue(expectedCoreVersion);
      const blockchainSpy = spyOn(core['blockchain'], 'getServiceVersion').and.returnValue(Promise.resolve(expectedBlockchainVersion));

      const fetchedResponse = await core.handleGetVersionRequest();

      expect(serviceInfoSpy).toHaveBeenCalled();
      expect(blockchainSpy).toHaveBeenCalled();
      expect(fetchedResponse.status).toEqual(ResponseStatus.Succeeded);

      // Sort the output to make it easier to validate
      const fetchedVersions: ServiceVersionModel[] = JSON.parse(fetchedResponse.body);
      fetchedVersions.sort((a, b) => a.name > b.name ? 1 : -1);

      expect(fetchedVersions[0]).toEqual(expectedCoreVersion);
      expect(fetchedVersions[1]).toEqual(expectedBlockchainVersion);
    });
  });

  describe('handleResolveRequest', () => {
    it('should call the needed functions and return a response', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);
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
      const core = new Core(testConfig, testVersionConfig, mockCas);
      const mockRequestHandler = jasmine.createSpyObj<IRequestHandler>('versionManagerSpy', ['handleOperationRequest']);
      mockRequestHandler.handleOperationRequest.and.callFake(() => { return resolvedRequest; });
      core['versionManager']['getRequestHandler'] = () => { return mockRequestHandler; };
      core['blockchain']['cachedBlockchainTime'] = { time: Number.MAX_SAFE_INTEGER, hash: 'hash' };
      const response = await core.handleOperationRequest(Buffer.from('some string'));
      expect(mockRequestHandler.handleOperationRequest).toHaveBeenCalled();
      expect(response).toEqual({ status: ResponseStatus.Succeeded, body: null });
    });
  });

  describe('upgradeDatabaseIfNeeded', () => {
    beforeEach(() => {
    });

    it('should not perform upgrade if saved service version is the same as the running service version.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      // Simulate that the saved service version is the same as the running service version.
      const serviceStateModel = core['serviceInfo'].getServiceVersion();
      spyOn(core['serviceStateStore'], 'get').and.returnValue(Promise.resolve({ serviceVersion: serviceStateModel.version }));

      const serviceStateStorePutSpy = spyOn(core['serviceStateStore'], 'put');
      await (core as any).upgradeDatabaseIfNeeded();

      // Verify that upgrade path was NOT invoked.
      expect(serviceStateStorePutSpy).not.toHaveBeenCalled();
    });

    it('should perform upgrade if saved service version is different from running service version.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      const operationStoreDeleteSpy = spyOn(core['operationStore'], 'delete');
      const unresolvableTransactionStoreClearCollectionSpy = spyOn(core['unresolvableTransactionStore'], 'clearCollection');
      const transactionStoreClearCollectionSpy = spyOn(core['transactionStore'], 'clearCollection');
      const serviceStateStorePutSpy = spyOn(core['serviceStateStore'], 'put');

      // Simulate that the saved service state is different (`undefined`) from the running service version.
      spyOn(core['serviceStateStore'], 'get').and.returnValue(Promise.resolve(undefined));

      await (core as any).upgradeDatabaseIfNeeded();

      // Verify that that upgrade path was invoked.
      expect(operationStoreDeleteSpy).toHaveBeenCalled();
      expect(unresolvableTransactionStoreClearCollectionSpy).toHaveBeenCalled();
      expect(transactionStoreClearCollectionSpy).toHaveBeenCalled();
      expect(serviceStateStorePutSpy).toHaveBeenCalled();
    });
  });
});
