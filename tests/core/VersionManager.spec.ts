import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import Config from '../../lib/core/models/Config';
import DownloadManager from '../../lib/core/DownloadManager';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationStore from '../mocks/MockOperationStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import OperationType from '../../lib/core/enums/OperationType';
import Resolver from '../../lib/core/Resolver';
import TransactionModel from '../../lib/common/models/TransactionModel';
import VersionManager, { ProtocolVersionModel } from '../../lib/core/VersionManager';

describe('VersionManager', async () => {

  let config: Config;
  let blockChain: IBlockchain;
  let cas: ICas;
  let operationStore: IOperationStore;
  let downloadMgr: DownloadManager;
  let mockTransactionStore: ITransactionStore;

  beforeEach(() => {
    config = require('../json/config-test.json');
    blockChain = new MockBlockchain();
    cas = new MockCas();
    operationStore = new MockOperationStore();
    downloadMgr = new DownloadManager(1, cas);
    mockTransactionStore = new MockTransactionStore();
  });

  describe('initialize()', async () => {

    it('should initialize all the objects correctly.', async () => {

      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);
      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore);

      // No exception thrown == initialize was successful
    });

    it('should throw if version metadata is the wrong type.', async () => {

      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        if (className === 'VersionMetadata') {
          const fakeClass = class {}; // a fake class that does nothing
          return fakeClass;
        } else {
          return (await import(`./versions/${version}/${className}`)).default;
        }
      });

      const resolver = new Resolver(versionMgr, operationStore, versionMgr.allSupportedHashAlgorithms);

      try {
        await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore);
        fail('expect to throw but did not');
      } catch (e) {
        expect(e.code).toEqual('version_manager_version_metadata_incorrect_type');
      }
    });

    it('should throw if the versions folder is missing.', async () => {
      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'invalid_version' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      const resolver = new Resolver(versionMgr, operationStore);
      await expectAsync(versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore)).toBeRejected();
    });
  });

  describe('getVersionMetadataByTransactionTime', () => {
    it('should return the expected versionMetadata', async () => {
      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore, versionMgr.allSupportedHashAlgorithms);
      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore);

      const result = versionMgr.getVersionMetadataByTransactionTime(1001);
      expect(result.hashAlgorithmInMultihashCode).toEqual(18);
      expect(result.normalizedFeeToPerOperationFeeMultiplier).toEqual(0.01);
    });
  });

  describe('get* functions.', async () => {

    it('should return the correct version-ed objects for valid version.', async () => {
      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);

      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore);

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
      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'test-version-1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const resolver = new Resolver(versionMgr, operationStore);

      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver, mockTransactionStore);

      // Expect an invalid blockchain time input to throw
      expect(() => { versionMgr.getBatchWriter(0); }).toThrowError();
      expect(() => { versionMgr.getOperationProcessor(999); }).toThrowError();
      expect(() => { versionMgr.getRequestHandler(100); }).toThrowError();
      expect(() => { versionMgr.getTransactionProcessor(500); }).toThrowError();
    });
  });
});
