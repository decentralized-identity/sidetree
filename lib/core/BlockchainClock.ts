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
    private cachedApprocimateTime?: number;

    /**
     *
     * @param blockchain The blockchain client to use
     * @param serviceStateStore The service state store to store time in
     * @param enableRealBlockchainTimePull If enabled, will pull real blockchain time from blockchain, else will only use time from db
     */
    public constructor (
        private blockchain: Blockchain,
        private serviceStateStore: IServiceStateStore<ServiceStateModel>,
        private enableRealBlockchainTimePull: boolean
    ) { }

    /**
     * Get the time
     * @returns the time
     */
    public getTime (): number | undefined {
      return this.cachedApprocimateTime;
    }

    /**
     * Start periodically pulling blockahin time. Will use real blockchain time if enabled
     */
    public async startPeriodicPullLatestBlockchainTime () {
      if (this.enableRealBlockchainTimePull) {
        await this.pullRealBlockchainTime();
      }

      await this.cacheTime();

      if (this.continuePulling) {
        setTimeout(async () => this.startPeriodicPullLatestBlockchainTime(), this.blockchainTimePullIntervalInSeconds * 1000);
      }
    }

    private async pullRealBlockchainTime () {
      try {
        const latestBlockchainTime = await this.blockchain.getLatestTime();
        const serviceState = await this.serviceStateStore.get();
        serviceState.approximateTime = latestBlockchainTime.time;
        await this.serviceStateStore.put(serviceState);
        EventEmitter.emit(EventCode.SidetreeBlockchainTimeChanged, { time: latestBlockchainTime.time });
      } catch (e) {
        Logger.error(`Error occured while updating blockchain time, investigate and fix: ${e}`);
      }
    }

    private async cacheTime () {
      try {
        const newApproximateTime = (await this.serviceStateStore.get()).approximateTime;
        Logger.info(`Core approximateTime updated to: ${newApproximateTime}`);
        this.cachedApprocimateTime = newApproximateTime;
      } catch (e) {
        Logger.error(`Error occured while caching blockchain time, investigate and fix: ${e}`);
      }
    }
}
