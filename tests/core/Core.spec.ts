import Config from '../../lib/core/models/Config';
import Core from '../../lib/core/Core';
import ErrorCode from '../../lib/core/ErrorCode';
import EventEmitter from '../../lib/common/EventEmitter';
import IRequestHandler from '../../lib/core/interfaces/IRequestHandler';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
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
      expect(core['unresolvableTransactionStore']['databaseName']).toEqual(databaseName);
      // true because it is set by config value
      expect(core['blockchainClock']['enableRealBlockchainTimePull']).toEqual(true);
    });
  });

  describe('initialize', async () => {
    it('should initialize all required dependencies', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);
      const serviceStateStoreInitializeSpy = spyOn(core['serviceStateStore'], 'initialize');
      const transactionStoreInitSpy = spyOn(core['transactionStore'], 'initialize');
      const unresolvableTransactionStoreInitSpy = spyOn(core['unresolvableTransactionStore'], 'initialize');
      const operationStoreInitSpy = spyOn(core['operationStore'], 'initialize');
      const confirmationStoreInitSpy = spyOn(core['confirmationStore'], 'initialize');
      const upgradeDatabaseIfNeededSpy = spyOn(core as any, 'upgradeDatabaseIfNeeded');
      const versionManagerInitSpy = spyOn(core['versionManager'], 'initialize');
      const observerStartSpy = spyOn(core['observer'], 'startPeriodicProcessing');
      const batchSchedulerStartSpy = spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      const downloadManagerStartSpy = spyOn(core['downloadManager'], 'start');
      const monitorInitializeSpy = spyOn(core.monitor, 'initialize');
      // mocking it so initialize doesn't actually start the periodic pull

      await core.initialize();
      expect(serviceStateStoreInitializeSpy).toHaveBeenCalled();
      expect(transactionStoreInitSpy).toHaveBeenCalled();
      expect(unresolvableTransactionStoreInitSpy).toHaveBeenCalled();
      expect(operationStoreInitSpy).toHaveBeenCalled();
      expect(confirmationStoreInitSpy).toHaveBeenCalled();
      expect(upgradeDatabaseIfNeededSpy).toHaveBeenCalled();
      expect(versionManagerInitSpy).toHaveBeenCalled();
      expect(observerStartSpy).toHaveBeenCalled();
      expect(batchSchedulerStartSpy).toHaveBeenCalled();
      expect(downloadManagerStartSpy).toHaveBeenCalled();
      expect(monitorInitializeSpy).toHaveBeenCalled();
    });

    it('should override the default logger/event emitter if custom logger/event emitter is given.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      spyOn(core['serviceStateStore'], 'initialize');
      spyOn(core['transactionStore'], 'initialize');
      spyOn(core['unresolvableTransactionStore'], 'initialize');
      spyOn(core['operationStore'], 'initialize');
      spyOn(core['confirmationStore'], 'initialize');
      spyOn(core as any, 'upgradeDatabaseIfNeeded');
      spyOn(core['versionManager'], 'initialize');
      spyOn(core['observer'], 'startPeriodicProcessing');
      spyOn(core['batchScheduler'], 'startPeriodicBatchWriting');
      spyOn(core['downloadManager'], 'start');
      spyOn(core.monitor, 'initialize');

      let customLoggerInvoked = false;
      const customLogger = {
        info: () => { customLoggerInvoked = true; },
        warn: () => { },
        error: () => { },
        debug: () => { }
      };

      let customEvenEmitterInvoked = false;
      const customEvenEmitter = {
        emit: async () => { customEvenEmitterInvoked = true; }
      };

      // mocking it so initialize doesn't actually start the periodic pull
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
      spyOn(core['confirmationStore'], 'initialize');
      spyOn(core as any, 'upgradeDatabaseIfNeeded');
      spyOn(core['versionManager'], 'initialize');
      spyOn(core['downloadManager'], 'start');
      spyOn(core.monitor, 'initialize');

      // mocking it so initialize doesn't actually start the periodic pull
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
      spyOn(core['blockchain'], 'getLatestTime').and.returnValue(Promise.resolve({ time: Number.MAX_SAFE_INTEGER, hash: 'hash' }));
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
      spyOn(core['blockchain'], 'getLatestTime').and.returnValue(Promise.resolve({ time: Number.MAX_SAFE_INTEGER, hash: 'hash' }));
      const response = await core.handleOperationRequest(Buffer.from('some string'));
      expect(mockRequestHandler.handleOperationRequest).toHaveBeenCalled();
      expect(response).toEqual({ status: ResponseStatus.Succeeded, body: null });
    });
  });

  describe('upgradeDatabaseIfNeeded', () => {
    beforeEach(() => {
    });

    it('should not perform upgrade if the node is not an active Observer node.', async () => {
      const config = Object.assign({}, testConfig);
      config.observingIntervalInSeconds = 0; // Force disabling of Observer.
      const core = new Core(config, testVersionConfig, mockCas);

      const serviceStateStorePutSpy = spyOn(core['serviceStateStore'], 'put');
      await (core as any).upgradeDatabaseIfNeeded();

      // Verify that upgrade path was NOT invoked.
      expect(serviceStateStorePutSpy).not.toHaveBeenCalled();
    });

    it('should not perform upgrade if saved database version is the same as the expected database version.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      // Simulate that the saved database version is the same as the expected database version.
      spyOn(core['serviceStateStore'], 'get').and.returnValue(Promise.resolve({ databaseVersion: '1.1.0' }));

      const serviceStateStorePutSpy = spyOn(core['serviceStateStore'], 'put');
      await (core as any).upgradeDatabaseIfNeeded();

      // Verify that upgrade path was NOT invoked.
      expect(serviceStateStorePutSpy).not.toHaveBeenCalled();
    });

    it('should perform upgrade if saved database version is older than the current running database version.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      const operationStoreDeleteSpy = spyOn(core['operationStore'], 'delete');
      const operationStoreCreateIndexSpy = spyOn(core['operationStore'], 'createIndex');
      const unresolvableTransactionStoreClearCollectionSpy = spyOn(core['unresolvableTransactionStore'], 'clearCollection');
      const transactionStoreClearCollectionSpy = spyOn(core['transactionStore'], 'clearCollection');
      const serviceStateStorePutSpy = spyOn(core['serviceStateStore'], 'put');

      // Mock a saved database version that is definitely older than the expected version to trigger DB upgrade.
      spyOn(core['serviceStateStore'], 'get').and.returnValue(Promise.resolve({ databaseVersion: '0.0.1' }));

      await (core as any).upgradeDatabaseIfNeeded();

      // Verify that that upgrade path was invoked.
      expect(operationStoreDeleteSpy).toHaveBeenCalled();
      expect(unresolvableTransactionStoreClearCollectionSpy).toHaveBeenCalled();
      expect(transactionStoreClearCollectionSpy).toHaveBeenCalled();
      expect(operationStoreCreateIndexSpy).toHaveBeenCalled();
      expect(serviceStateStorePutSpy).toHaveBeenCalledWith({ databaseVersion: '1.1.0' });
    });

    it('should throw if attempting to run older code on newer DB.', async () => {
      const core = new Core(testConfig, testVersionConfig, mockCas);

      // Mock a saved database version that is definitely newer than the expected version to trigger expected error.
      spyOn(core['serviceStateStore'], 'get').and.returnValue(Promise.resolve({ databaseVersion: '99999.0.0' }));

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => (core as any).upgradeDatabaseIfNeeded(),
        ErrorCode.DatabaseDowngradeNotAllowed
      );
    });
  });
});
