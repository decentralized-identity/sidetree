import BlockchainClock from '../../lib/core/BlockchainClock';
import MockBlockchain from '../mocks/MockBlockchain';
import MockServiceStateStore from '../mocks/MockServiceStateStore';

describe('BlockchainClock', () => {
  let blockchainClock: BlockchainClock;
  beforeEach(() => {
    blockchainClock = new BlockchainClock(new MockBlockchain() as any, new MockServiceStateStore(), true);
  });

  describe('getTime', () => {
    it('should return cached time', () => {
      expect(blockchainClock.getTime()).toEqual(undefined);
      blockchainClock['cachedApproximateTime'] = 123;
      expect(blockchainClock.getTime()).toEqual(123);
    });
  });

  describe('startPeriodicPullLatestBlockchainTime', () => {
    it('should pull the blockchain time periodically', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      spyOn(blockchainClock['blockchain'], 'getLatestTime').and.returnValue(Promise.resolve({ time: 123, hash: 'someHash' }));
      jasmine.clock().install();
      jasmine.clock().mockDate();
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      // store is updated and cache is updated
      expect(await blockchainClock['serviceStateStore'].get()).toEqual({ approximateTime: 123 });
      expect(blockchainClock['cachedApproximateTime']).toEqual(123);
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });

    it('should pull the blockchain time periodically when error is thrown', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      spyOn(blockchainClock['blockchain'], 'getLatestTime').and.throwError('Fake test error');
      spyOn(blockchainClock['serviceStateStore'], 'get').and.throwError('Fake test Error');
      jasmine.clock().install();
      jasmine.clock().mockDate();
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      // store is throwing error and cached time is not updated
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });

    it('should pull the blockchain time periodically from db when bitcoin client error', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      spyOn(blockchainClock['blockchain'], 'getLatestTime').and.throwError('Fake test error');
      spyOn(blockchainClock['serviceStateStore'], 'get').and.returnValue(Promise.resolve({ approximateTime: 123 }));
      jasmine.clock().install();
      jasmine.clock().mockDate();
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      // store is throwing error and cached time is not updated
      expect(blockchainClock['cachedApproximateTime']).toEqual(123);
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });

    it('should only pull from db if enableRealBlockchainTime is false', async () => {
      blockchainClock['blockchainTimePullIntervalInSeconds'] = 0.01;
      blockchainClock['enableRealBlockchainTimePull'] = false;
      const pullIntervalSpy = spyOn(blockchainClock as any, 'startPeriodicPullLatestBlockchainTime').and.callThrough();
      const pullRealBlockchainTimeSpy = spyOn(blockchainClock as any, 'pullRealBlockchainTime');
      jasmine.clock().install();
      jasmine.clock().mockDate();
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      await blockchainClock['startPeriodicPullLatestBlockchainTime']();
      expect(pullIntervalSpy).toHaveBeenCalledTimes(1);
      // store is not being updated so cache isn't updating
      expect(pullRealBlockchainTimeSpy).not.toHaveBeenCalled();
      expect(blockchainClock['cachedApproximateTime']).toEqual(undefined);
      jasmine.clock().tick(11);
      expect(pullIntervalSpy).toHaveBeenCalledTimes(2);
      blockchainClock['continuePulling'] = false;
      jasmine.clock().uninstall();
    });
  });
});
