import * as crypto from 'crypto';
import Logger from './lib/Logger';
import { Cas } from './Cas';

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
   * The resolve function that will be invoked by the download manager when download is completed
   * regarless if the download is successful or not.
   */
  resolve: (value?: {} | PromiseLike<{}> | undefined) => void;

  /**
   * Set to true if download attempt is completed either successfully or unsuccessfully.
   */
  completed: boolean;

  /**
   * Holds the content once the download is completed and successful; `undefined` otherwise.
   */
  content: Buffer | undefined;
}

/**
 * A download manager class that performs multiple downloads at the same time.
 */
export default class DownloadManager {
  private pendingDownloads: DownloadInfo[] = [];
  private activeDownloads: Map<Buffer, DownloadInfo> = new Map();
  private completedDownloads: Map<Buffer, Buffer | undefined> = new Map();

  /**
   * Constructs the download manager.
   * @param cas The CAS to use for fetching the actual content.
   */
  public constructor (
    public maxConcurrentCasDownloads: number,
    private cas: Cas) {
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
          this.completedDownloads.set(downloadHandle, downloadInfo.content);
          completedDownloadHandles.push(downloadHandle);

          // Resolve the promise associated with the download.
          downloadInfo.resolve();
        }
      }
      for (const downloadHandle of completedDownloadHandles) {
        this.activeDownloads.delete(downloadHandle);
      }

      // If maximum concurrent download count is reached, then we can't schedule more downloads.
      const availableDownloadLanes = this.maxConcurrentCasDownloads - this.activeDownloads.size;
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
        void this.downloadAsync(downloadInfo.contentHash, downloadInfo);
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
  public async download (contentHash: string): Promise<Buffer | undefined> {
    const handle = crypto.randomBytes(32);
    const fetchPromise = new Promise(resolve => {
      const downloadInfo = { handle, contentHash, resolve, completed: false, content: undefined };
      this.pendingDownloads.push(downloadInfo);
    });

    await fetchPromise;

    const content = this.completedDownloads.get(handle);
    this.completedDownloads.delete(handle);

    return content;
  }

  /**
   * The internal download method that gets called by the main download manager monitoring loop when download lanes are available to download content.
   * @param downloadInfo The data structure used to signal to the main download manager monitoring loop when the requested download is completed.
   */
  private async downloadAsync (contentHash: string, downloadInfo: DownloadInfo): Promise<void> {
    let fileBuffer;
    try {
      fileBuffer = await this.cas.read(contentHash);
      Logger.info(`Downloaded content '${contentHash}'.}'.`);
    } catch (error) {
      Logger.info(`Failed downloading '${contentHash}: ${error}'.`);
    }

    downloadInfo.completed = true;
    downloadInfo.content = fileBuffer;
  }
}
