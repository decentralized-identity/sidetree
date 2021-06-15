import BlockchainClock from '../../lib/core/BlockchainClock';
import MockBlockchain from '../mocks/MockBlockchain';
import MockServiceStateStore from '../mocks/MockServiceStateStore';

describe('BlockchainClock', () => {
  let blockchainClock: BlockchainClock;
  beforeEach(() => {
    blockchainClock = new BlockchainClock(new MockBlockchain() as any, new MockServiceStateStore());
  });

  describe('getApproximateTime', () => {
    it('should return cached approximate time', () => {
      expect(blockchainClock.getApproximateTime()).toEqual(undefined);
      blockchainClock['cachedApprocimateTime'] = 123;
      expect(blockchainClock.getApproximateTime()).toEqual(123);
    });
  });

  describe('startPeriodicPullLatestBlockchainTime', () => {
    it('should pull the blockchain time periodically', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      spyOn(blockchainClock['blockchain'], 'getLatestTime').and.returnValue(Promise.resolve({ time: 123, hash: 'someHash' }));
      jasmine.clock().install();
      jasmine.clock().mockDate();
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      expect(await blockchainClock['serviceStateStore'].get()).toEqual({ approximateTime: 123 });
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });

    it('should pull the blockchain time periodically when error is thrown', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      spyOn(blockchainClock['blockchain'], 'getLatestTime').and.throwError('Fake test error');
      jasmine.clock().install();
      jasmine.clock().mockDate();
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });
  });

  describe('startPeriodicCacheTime', () => {
    it('should cache blockchain time periodically', async () => {
      let counter = 0;
      blockchainClock['approximateTimeUpdateIntervalInSeconds'] = 0.01;
      const periodicPullSpy = spyOn(blockchainClock as any, 'startPeriodicCacheTime').and.callThrough();
      spyOn(blockchainClock['serviceStateStore'], 'get').and.callFake(() => { counter++; return Promise.resolve({ approximateTime: counter }); });
      jasmine.clock().install();
      expect(blockchainClock['cachedApprocimateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicCacheTime']();
      expect(blockchainClock.getApproximateTime()).toEqual(1);
      expect(periodicPullSpy).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(11);
      expect(periodicPullSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });

    it('should continue loop periodically when error is thrown', async () => {
      blockchainClock['approximateTimeUpdateIntervalInSeconds'] = 0.01;
      const periodicPullSpy = spyOn(blockchainClock as any, 'startPeriodicCacheTime').and.callThrough();
      spyOn(blockchainClock['serviceStateStore'], 'get').and.throwError('Fake test Error');
      jasmine.clock().install();
      expect(blockchainClock['cachedApprocimateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicCacheTime']();
      expect(periodicPullSpy).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(11);
      expect(periodicPullSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });
  });
});
