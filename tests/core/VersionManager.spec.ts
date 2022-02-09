import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import Config from '../../lib/core/models/Config';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/core/ErrorCode';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import ICas from '../../lib/core/interfaces/ICas';
import IConfirmationStore from '../../lib/core/interfaces/IConfirmationStore';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockConfirmationStore from '../mocks/MockConfirmationStore';
import MockOperationStore from '../mocks/MockOperationStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import Resolver from '../../lib/core/Resolver';
import TransactionModel from '../../lib/common/models/TransactionModel';
import VersionManager from '../../lib/core/VersionManager';
import VersionModel from '../../lib/core/models/VersionModel';

describe('VersionManager', async () => {

  let config: Config;
  let blockChain: IBlockchain;
  let cas: ICas;
  let operationStore: IOperationStore;
  let downloadMgr: DownloadManager;
  let mockTransactionStore: ITransactionStore;
  let mockConfirmationStore: IConfirmationStore;

  beforeEach(() => {
    config = require('../json/config-test.json');
    blockChain = new MockBlockchain();
    cas = new MockCas();
    operationStore = new MockOperationStore();
    downloadMgr = new DownloadManager(1, cas);
    mockTransactionStore = new MockTransactionStore();
    mockConfirmationStore = new MockConfirmationStore();
  });

  describe('initialize()', async () => {

    it('should initialize all the objects correctly.', async () => {

      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);
      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);
      expect(versionMgr['batchWriters'].get('test-version-1') as any ['versionMetadataFetcher']).toBeDefined();
      expect(versionMgr['transactionProcessors'].get('test-version-1') as any ['versionMetadataFetcher']).toBeDefined();

      // No exception thrown == initialize was successful
    });

    it('should throw if version metadata is the wrong type.', async () => {

      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        if (className === 'VersionMetadata') {
          const fakeClass = class {}; // a fake class that does nothing
          return fakeClass;
        } else {
          return (await import(`./versions/${version}/${className}`)).default;
        }
      });

      const resolver = new Resolver(versionMgr, operationStore);

      try {
        await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);
        fail('expect to throw but did not');
      } catch (e) {
        expect(e.code).toEqual(ErrorCode.VersionManagerVersionMetadataIncorrectType);
      }
    });

    it('should throw if the versions folder is missing.', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'invalid_version' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      const resolver = new Resolver(versionMgr, operationStore);
      await expectAsync(versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore
        , mockConfirmationStore)).toBeRejected();
    });
  });

  describe('loadDefaultExportsForVersion()', async () => {
    it('should be able to load a default export of a versioned component successfully.', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1, version: 'unused' }
      ];

      const versionManager = new VersionManager(config, versionModels);

      const OperationProcessor = await (versionManager as any).loadDefaultExportsForVersion('latest', 'OperationProcessor');
      const operationProcessor = new OperationProcessor();
      expect(operationProcessor).toBeDefined();
    });
  });

  describe('getTransactionSelector()', async () => {
    it('should return the correct version of `ITransactionSelector`.', async () => {

      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: '1000' },
        { startingBlockchainTime: 2000, version: '2000' }
      ];

      const versionManager = new VersionManager(config, versionModels);

      // Setting up loading of mock ITransactionSelector implementations.
      const mockTransactionSelector1 = class {
        selectQualifiedTransactions () { return []; }
      };
      const anyTransactionModel = OperationGenerator.generateTransactionModel();
      const mockTransactionSelector2 = class {
        selectQualifiedTransactions () { return [anyTransactionModel]; }
      };
      spyOn(versionManager as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        if (className === 'TransactionSelector') {
          if (version === '1000') {
            return mockTransactionSelector1;
          } else { // '2000'
            return mockTransactionSelector2;
          }
        }

        // Else we are loading components unrelated to this test, default to loading from `latest` version folder.
        const classObject = (await import(`../../lib/core/versions/latest/${className}`)).default;

        // Override the `intialize()` call so no network call occurs, else the test the will fail in GitHub CICD.
        if (className === 'MongoDbOperationQueue') {
          classObject.prototype.initialize = async () => {};
        }

        return classObject;
      });

      const resolver = new Resolver(versionManager, operationStore);
      await versionManager.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);
      const transactions = await versionManager.getTransactionSelector(2001).selectQualifiedTransactions([]);

      expect(transactions[0].anchorString).toEqual(anyTransactionModel.anchorString);
    });
  });

  describe('getVersionMetadata', () => {
    it('should return the expected versionMetadata', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);
      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);

      const result = versionMgr.getVersionMetadata(1001);
      expect(result.normalizedFeeToPerOperationFeeMultiplier).toEqual(0.01);
    });
  });

  describe('get* functions.', async () => {

    it('should return the correct version-ed objects for valid version.', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);

      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);

      // Get the objects for the valid version (see versions/testingversion1 folder) and call
      // functions on the objects to make sure that the correct objects are being returned.
      // For testing, the functions in the above testingversion folder are throwing errors so
      // that is way that we can tell that the correct object is actually being returned.
      const batchWriter = versionMgr.getBatchWriter(1000);
      await expectAsync(batchWriter.write()).toBeRejected();

      const operationProcessor = versionMgr.getOperationProcessor(1001);
      const namedAnchoredOpModel: AnchoredOperationModel = {
        type: OperationType.Create,
        didUniqueSuffix: 'unusedDidUniqueSuffix',
        transactionTime: 0,
        transactionNumber: 0,
        operationIndex: 0,
        operationBuffer: Buffer.from('')
      };
      await expectAsync(operationProcessor.apply(namedAnchoredOpModel, undefined)).toBeRejected();

      const requestHandler = versionMgr.getRequestHandler(2000);
      await expectAsync(requestHandler.handleResolveRequest('')).toBeRejected();

      const txProcessor = versionMgr.getTransactionProcessor(10000);
      const txModel: TransactionModel = {
        anchorString: '',
        transactionNumber: 0,
        transactionTime: 0,
        transactionTimeHash: '',
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      await expectAsync(txProcessor.processTransaction(txModel)).toBeRejected();
    });

    it('should throw for an invalid version.', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, versionModels);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);

      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore, mockConfirmationStore);

      // Expect an invalid blockchain time input to throw
      expect(() => { versionMgr.getBatchWriter(0); }).toThrowError();
      expect(() => { versionMgr.getOperationProcessor(999); }).toThrowError();
      expect(() => { versionMgr.getRequestHandler(100); }).toThrowError();
      expect(() => { versionMgr.getTransactionProcessor(500); }).toThrowError();
    });
  });
});
