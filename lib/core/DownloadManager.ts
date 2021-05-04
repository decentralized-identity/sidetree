import * as crypto from 'crypto';
import EventCode from './EventCode';
import EventEmitter from '../common/EventEmitter';
import FetchResult from '../common/models/FetchResult';
import ICas from './interfaces/ICas';
import Logger from '../common/Logger';

/**
 * Interface containing information regarding each queued CAS download.
 */
interface DownloadInfo {
  /**
   * A globally unique handle to this download.
   */
  handle: Buffer;

  /**
   * The content hash used to perform the download from CAS.
   */
  contentHash: string;

  /**
   * The maximum allowed content size.
   */
  maxSizeInBytes: number;

  /**
   * The resolve function that will be invoked by the download manager when download is completed
   * regardless if the download is successful or not.
   */
  resolve: (value?: {} | PromiseLike<{}> | undefined) => void;

  /**
   * Set to true if download attempt is completed either successfully or unsuccessfully.
   */
  completed: boolean;

  /**
   * Holds the fetch result once the download is completed.
   */
  fetchResult?: FetchResult;
}

/**
 * A download manager class that performs multiple downloads at the same time.
 */
export default class DownloadManager {
  private pendingDownloads: DownloadInfo[] = [];
  private activeDownloads: Map<Buffer, DownloadInfo> = new Map();
  private completedDownloads: Map<Buffer, FetchResult> = new Map();

  /**
   * Constructs the download manager.
   * @param cas The Content Addressable Store to use for fetching the actual content.
   */
  public constructor (
    public maxConcurrentDownloads: number,
    private cas: ICas) {

    // If maximum concurrent CAS download count is NaN, set it to a default value.
    if (isNaN(maxConcurrentDownloads)) {
      const defaultMaxConcurrentDownloads = 20;
      Logger.info(`Maximum concurrent CAS download count not given, defaulting to ${defaultMaxConcurrentDownloads}.`);
      this.maxConcurrentDownloads = defaultMaxConcurrentDownloads;
    }
  }

  /**
   * Starts pending downloads if maximum concurrent download count is not reached,
   * and resolve downloads that are completed, then invokes this same method again,
   * thus this method must only be invoked once externally as initialization.
   */
  public start () {
    try {
      // Move all completed downloads in `activeDownloads` to the `completedDownloads` map.
      const completedDownloadHandles = [];
      for (const [downloadHandle, downloadInfo] of this.activeDownloads) {
        if (downloadInfo.completed) {
          this.completedDownloads.set(downloadHandle, downloadInfo.fetchResult!);
          completedDownloadHandles.push(downloadHandle);

          // Resolve the promise associated with the download.
          downloadInfo.resolve();
        }
      }
      for (const downloadHandle of completedDownloadHandles) {
        this.activeDownloads.delete(downloadHandle);
      }

      // If maximum concurrent download count is reached, then we can't schedule more downloads.
      const availableDownloadLanes = this.maxConcurrentDownloads - this.activeDownloads.size;
      if (availableDownloadLanes <= 0) {
        return;
      }

      // Else we can schedule more downloads, but only if there are pending downloads.
      if (this.pendingDownloads.length === 0) {
        return;
      }

      // Keep start downloading the next queued item until all download lanes are full or there is no more item to download.
      for (let i = 0; i < this.pendingDownloads.length && i < availableDownloadLanes; i++) {
        const downloadInfo = this.pendingDownloads[i];

        // Intentionally not awaiting on a download.
        this.downloadAsync(downloadInfo);
        this.activeDownloads.set(downloadInfo.handle, downloadInfo);
      }

      // Remove active downloads from `pendingDownloads` list.
      this.pendingDownloads.splice(0, availableDownloadLanes);
    } catch (error) {
      Logger.error(`Encountered unhandled/unexpected error in DownloadManager, must investigate and fix: ${error}`);
    } finally {
      setTimeout(async () => this.start(), 1000);
    }
  }

  /**
   * Downloads the content of the given content hash.
   * @param contentHash Hash of the content to be downloaded.
   */
  public async download (contentHash: string, maxSizeInBytes: number): Promise<FetchResult> {
    const handle = crypto.randomBytes(32);
    const fetchPromise = new Promise(resolve => {
      const downloadInfo = { handle, contentHash, maxSizeInBytes, resolve, completed: false, content: undefined };
      this.pendingDownloads.push(downloadInfo);
    });

    await fetchPromise;

    const fetchResult = this.completedDownloads.get(handle);
    this.completedDownloads.delete(handle);

    EventEmitter.emit(EventCode.SidetreeDownloadManagerDownload, { code: fetchResult!.code });
    return fetchResult!;
  }

  /**
   * The internal download method that gets called by the main download manager monitoring loop when download lanes are available to download content.
   * NOTE: This method MUST NEVER throw (more accurately: ALWAYS set downloadInfo.completed = true),
   * else it will LEAK the available download lanes and in turn hang the Observer.
   * @param downloadInfo Data structure containing `completed` flag and `fetchResult`,
   *                     used to signal to the main download manager monitoring loop when the requested download is completed.
   */
  private async downloadAsync (downloadInfo: DownloadInfo): Promise<void> {
    let contentHash = '';
    try {
      contentHash = downloadInfo.contentHash;

      const fetchResult = await this.cas.read(contentHash, downloadInfo.maxSizeInBytes);

      downloadInfo.fetchResult = fetchResult;
    } catch (error) {
      Logger.error(`Unexpected error while downloading '${contentHash}, investigate and fix ${error}'.`);
    } finally {
      downloadInfo.completed = true;
    }
  }
}
