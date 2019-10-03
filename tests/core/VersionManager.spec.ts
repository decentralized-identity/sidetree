import Config from '../../lib/core/models/Config';
import VersionManager, { ProtocolVersionModel } from '../../lib/core/VersionManager';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationStore from '../mocks/MockOperationStore';
import Resolver from '../../lib/core/Resolver';
import DownloadManager from '../../lib/core/DownloadManager';

describe('VersionManager', async () => {
  describe('initialize()', async () => {

    // let protocolVersionConfig: ProtocolVersionModel;
    let config: Config;

    beforeEach(() => {
      config = require('../json/config-test.json');
      // protocolVersionConfig = require('../json/core-protocol-versioning-test.json');
    });

    fit('should initialize all the objects correctly.', async () => {

      const protocolVersionConfig: ProtocolVersionModel[] = [
        { startingBlockchainTime: 1000, version: 'testversion1' }
      ];

      const versionMgr = new VersionManager(config, protocolVersionConfig);
      spyOn(versionMgr as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, className: string) => {
        return (await import(`./versions/${version}/${className}`)).default;
      });

      const blockChain = new MockBlockchain();
      const cas = new MockCas();
      const operationStore = new MockOperationStore();
      const resolver = new Resolver(versionMgr, operationStore);
      const downloadMgr = new DownloadManager(1, cas);

      await versionMgr.initialize(blockChain, cas, downloadMgr, operationStore, resolver);

      // Expect an invalid blockchain time input to throw
      expect(versionMgr.getBatchWriter(0)).toThrowError();
      expect(versionMgr.getOperationProcessor(0)).toThrowError();
      expect(versionMgr.getRequestHandler(0)).toThrowError();
      expect(versionMgr.getTransactionProcessor(0)).toThrowError();
    });
  });
});
