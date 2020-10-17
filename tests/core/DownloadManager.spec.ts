import * as timeSpan from 'time-span';
import DownloadManager from '../../lib/core/DownloadManager';
import ICas from '../../lib/core/interfaces/ICas';
import MockCas from '../mocks/MockCas';

describe('DownloadManager', async () => {
  const maxConcurrentDownloads = 3;
  const mockSecondsTakenForEachCasFetch = 2;

  let cas: ICas;
  let downloadManager: DownloadManager;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    cas = new MockCas(mockSecondsTakenForEachCasFetch);
    downloadManager = new DownloadManager(maxConcurrentDownloads, cas);
    downloadManager.start();
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  it('should queue up downloads if max concurrent download count is exceeded.', async () => {
    // Write some content in CAS.
    const content1 = await cas.write(Buffer.from('1'));
    const content2 = await cas.write(Buffer.from('2'));
    const content3 = await cas.write(Buffer.from('3'));
    const content4 = await cas.write(Buffer.from('4'));

    // Start timer to measure total time taken for the 4 downloads.
    const endTimer = timeSpan();

    // Queue 4 downloads.
    const maxContentSizeInBytes = 20000000;
    downloadManager.download(content1, maxContentSizeInBytes);
    downloadManager.download(content2, maxContentSizeInBytes);
    downloadManager.download(content3, maxContentSizeInBytes);
    await downloadManager.download(content4, maxContentSizeInBytes);

    // Since there is only 3 concurrent download lanes,
    // the 4th download would have to wait thus download time would be at least twice the time as the mock download time.
    const totalDownloadTimeInMs = endTimer.rounded();
    const minimalTimeTakenInMs = mockSecondsTakenForEachCasFetch * 2 * 1000;
    expect(totalDownloadTimeInMs).toBeGreaterThanOrEqual(minimalTimeTakenInMs);
  });
});
