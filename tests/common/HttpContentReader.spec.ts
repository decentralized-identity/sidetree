import HttpContentReader from '../../lib/common/HttpContentReader';
import { Headers } from 'node-fetch';

describe('HttpContentReader', () => {
  it('should read "Content-Length" from HTTP Headers.', async () => {
    const headers = new Headers();
    const expectedLength = 1024;
    headers.set('Content-Length', expectedLength.toString());
    const observedLength = HttpContentReader.getContentLengthFromHeaders(headers);

    expect(observedLength).toEqual(expectedLength);
  });

  it('should return undefined for HTTP Headers without "Content-Length".', async () => {
    const headers = new Headers();
    const observedLength = HttpContentReader.getContentLengthFromHeaders(headers);

    expect(observedLength).toBeUndefined();
  });
});
