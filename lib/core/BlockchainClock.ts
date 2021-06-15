import Blockchain from './Blockchain';
import EventCode from '../core/EventCode';
import EventEmitter from '../common/EventEmitter';
import IServiceStateStore from '../common/interfaces/IServiceStateStore';
import Logger from '../common/Logger';
import ServiceStateModel from './models/ServiceStateModel';

/**
 * Class used to manage approximate blockchain time
 */
export default class BlockchainClock {
    // used only for testing purposes to stop periodic pulling
    private continuePulling: boolean = true;

    /**
     * The interval which to pull and update blockchain time
     */
    private blockchainTimePullIntervalInSeconds = 60;

    /**
     * The interval which to cache the approximate time
     */
    private approximateTimeUpdateIntervalInSeconds: number = 60;

    private cachedApprocimateTime?: number;

    public constructor (private blockchain: Blockchain, private serviceStateStore: IServiceStateStore<ServiceStateModel>) { }

    /**
     * Start periodically update the cached blockchain time
     */
    public async startPeriodicCacheTime () {
      try {
        const newApproximateTime = (await this.serviceStateStore.get()).approximateTime;
        Logger.info(`Core approximateTime updated to: ${newApproximateTime}`);
        this.cachedApprocimateTime = newApproximateTime;
      } catch (e) {
        Logger.error(`Error occured while caching blockchain time, investigate and fix: ${e}`);
      }
      // shouldContinueTimePull is only used in tests to stop the pulling
      if (this.continuePulling) {
        setTimeout(async () => this.startPeriodicCacheTime(), this.approximateTimeUpdateIntervalInSeconds * 1000);
      }
    }

    /**
     * Get the cahed approcimate time
     * @returns the cached approcimate time
     */
    public getApproximateTime (): number | undefined {
      return this.cachedApprocimateTime;
    }

    /**
     * Start periodically pulling blockahin time from blockchain and store to service state store
     */
    public async startPeriodicPullLatestBlockchainTime () {
      try {
        const latestBlockchainTime = await this.blockchain.getLatestTime();
        const serviceState = await this.serviceStateStore.get();
        serviceState.approximateTime = latestBlockchainTime.time;
        await this.serviceStateStore.put(serviceState);
        EventEmitter.emit(EventCode.SidetreeBlockchainTimeChanged, { time: latestBlockchainTime.time });
      } catch (e) {
        Logger.error(`Error occured while updating blockchain time, investigate and fix: ${e}`);
      } finally {
        if (this.continuePulling) {
          setTimeout(async () => this.startPeriodicPullLatestBlockchainTime(), this.blockchainTimePullIntervalInSeconds * 1000);
        }
      }
    }
}
