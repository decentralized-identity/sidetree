import * as crypto from 'crypto';
import * as HttpStatus from 'http-status';
import * as url from 'url';
import base64url from 'base64url';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';
import ICas from '../core/interfaces/ICas';
import IpfsErrorCode from '../ipfs/IpfsErrorCode';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';
import Timeout from './Util/Timeout';

const multihashes = require('multihashes');

/**
 * Class that implements the `ICas` interface by communicating with IPFS.
 */
export default class Ipfs implements ICas {
  private fetch = nodeFetch;

  public constructor (private uri: string, private fetchTimeoutInSeconds: number) { }

  public async write (content: Buffer): Promise<string> {
    // A string that is cryptographically impossible to repeat as the boundary string.
    const multipartBoundaryString = crypto.randomBytes(32).toString('hex');

    // See https://tools.ietf.org/html/rfc7578#section-4.1
    // An example of multipart form data:
    //
    // --ABoundaryString
    //
    // Content of the first part.
    // --ABoundaryString
    // Content-Type: application/octet-stream
    //
    // Binary content of second part.
    // --ABoundaryString--
    const beginBoundary = Buffer.from(`--${multipartBoundaryString}\n`);
    const firstPartContentType = Buffer.from(`Content-Type: application/octet-stream\n\n`);
    const endBoundary = Buffer.from(`\n--${multipartBoundaryString}--`);
    const requestBody = Buffer.concat([beginBoundary, firstPartContentType, content, endBoundary]);

    const requestParameters = {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${multipartBoundaryString}` },
      body: requestBody
    };

    const addUrl = url.resolve(this.uri, '/api/v0/add'); // e.g. 'http://127.0.0.1:5001/api/v0/add'
    const response = await this.fetch(addUrl, requestParameters);

    if (response.status !== HttpStatus.OK) {
      console.error(`IPFS write error response status: ${response.status}`);

      if (response.body) {
        const errorBody = await ReadableStream.readAll(response.body);
        console.error(`IPFS write error body: ${errorBody}`);
      }

      throw new SidetreeError(IpfsErrorCode.IpfsFailedWritingContent, `Failed writing content of ${content.length} bytes.`);
    }

    const body = await ReadableStream.readAll(response.body);
    const base58EncodedMultihashString = JSON.parse(body.toString()).Hash;

    // Convert base58 to base64url multihash.
    const multihashBuffer = multihashes.fromB58String(base58EncodedMultihashString);
    const base64urlEncodedMultihash = base64url.encode(multihashBuffer);

    console.log(`Wrote ${content.length} byte content as IPFS CID: ${base58EncodedMultihashString}, base64url ID: ${base64urlEncodedMultihash}`);
    return base64urlEncodedMultihash;
  }

  public async read (base64urlEncodedMultihash: string, maxSizeInBytes: number): Promise<FetchResult> {
    // Convert base64url to base58 multihash.
    let base58EncodedMultihashString;
    try {
      const multihashBuffer = base64url.toBuffer(base64urlEncodedMultihash);
      multihashes.validate(multihashBuffer);
      base58EncodedMultihashString = multihashes.toB58String(multihashBuffer);
    } catch (error) {
      console.log(`'${base64urlEncodedMultihash}' is not a valid hash: ${SidetreeError.stringify(error)}`);
      return { code: FetchResultCode.InvalidHash };
    }

    // Fetch the content.
    let fetchResult;
    try {
      const fetchContentPromise = this.fetchContent(base58EncodedMultihashString, maxSizeInBytes);
      fetchResult = await Timeout.timeout(fetchContentPromise, this.fetchTimeoutInSeconds * 1000);
    } catch (error) {
      // Log appropriately based on error.
      if (error.code === IpfsErrorCode.TimeoutPromiseTimedOut) {
        console.log(`Timed out fetching CID '${base58EncodedMultihashString}', base64url ID: ${base64urlEncodedMultihash}.`);
      } else {
        // Log any unexpected error for investigation.
        const errorMessage =
          `Unexpected error while fetching CID '${base58EncodedMultihashString}', base64url ID: ${base64urlEncodedMultihash}. ` +
          `Investigate and fix: ${SidetreeError.stringify(error)}`;
        console.error(errorMessage);
      }

      // Mark content as `not found` if any error is thrown while fetching.
      return { code: FetchResultCode.NotFound };
    }

    // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already existing object does not create a duplicate.
    if (fetchResult.code === FetchResultCode.Success) {
      await this.pinContent(base58EncodedMultihashString);
      console.log(`Read and pinned ${fetchResult.content!.length} bytes for CID: ${base58EncodedMultihashString}, base64url ID: ${base64urlEncodedMultihash}.`);
    }

    return fetchResult;
  }

  /**
   * Fetch the content from IPFS.
   * This method also allows easy mocking in tests.
   */
  private async fetchContent (base58Multihash: string, maxSizeInBytes: number): Promise<FetchResult> {
    // Go-IPFS HTTP API call.
    let response;
    try {
      // e.g. 'http://127.0.0.1:5001/api/v0/cat?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL&length=100000'
      // NOTE: we pass max size + 1 to the API because the API will return up to the size given,
      // so if we give the exact max size, we would not know when the content of the exact max size is returned,
      // whether the content is truncated or not; with the +1, if the content returned has size of max size + 1,
      // we can safely discard the content (in the stream read below) and return size exceeded as the fetch result.
      // Alternatively, we could choose not to supply this optional `length` parameter, but we do so such that
      // IPFS is given the opportunity to optimize its download logic. (e.g. not needing to download the entire content).
      const catUrl = url.resolve(this.uri, `/api/v0/cat?arg=${base58Multihash}&length=${maxSizeInBytes + 1}`);
      response = await this.fetch(catUrl, { method: 'POST' });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { code: FetchResultCode.CasNotReachable };
      }

      throw error;
    }

    // Handle non-OK response.
    if (response.status !== HttpStatus.OK) {
      const body = await ReadableStream.readAll(response.body);
      const json = JSON.parse(body.toString());

      if (json.Message === 'this dag node is a directory') {
        return { code: FetchResultCode.NotAFile };
      }

      console.info(`Received response code ${response.status} from IPFS for CID ${base58Multihash}: ${json})}`);
      return { code: FetchResultCode.NotFound };
    }

    // Handle OK response.
    const fetchResult: FetchResult = { code: FetchResultCode.Success };
    try {
      fetchResult.content = await ReadableStream.readAll(response.body, maxSizeInBytes);
      return fetchResult;
    } catch (error) {
      if (error.code === SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded) {
        return { code: FetchResultCode.MaxSizeExceeded };
      }

      throw error;
    }
  }

  private async pinContent (hash: string) {
    // e.g. 'http://127.0.0.1:5001/api/v0/pin?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL'
    const pinUrl = url.resolve(this.uri, `/api/v0/pin?arg=${hash}`);
    await this.fetch(pinUrl, { method: 'POST' });
  }
}
