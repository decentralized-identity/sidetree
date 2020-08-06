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

  public constructor (public uri: string, private fetchTimeoutInSeconds: number) { }

  public async write (content: Buffer): Promise<string> {
    // A string that is cryptographically impossible to repeat as the boundary string.
    const multipartBoundaryString = crypto.randomBytes(32).toString('hex');

    // An exmaple of multipart form data:
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
    } catch {
      return { code: FetchResultCode.InvalidHash };
    }

    const fetchContentPromise = this.fetchContent(base58EncodedMultihashString, maxSizeInBytes);
    const fetchResult = await Timeout.timeout(fetchContentPromise, this.fetchTimeoutInSeconds * 1000);

    // Mark content as `not found` if any error is thrown while fetching.
    if (fetchResult instanceof Error) {
      // Log appropriately based on error.
      if (fetchResult instanceof SidetreeError &&
          fetchResult.code === IpfsErrorCode.TimeoutPromiseTimedOut) {
        console.log(`'${base64urlEncodedMultihash}' not found on IPFS.`);
      } else {
        // Log any unexpected error for investigation.
        console.error(`Unexpected error fetching '${base64urlEncodedMultihash}' not found on IPFS.`);
      }

      return { code: FetchResultCode.NotFound };
    }

    // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already existing object does not create a duplicate.
    if (fetchResult.code === FetchResultCode.Success) {
      await this.pinContent(base58EncodedMultihashString);
      console.log(`Read and pinned ${fetchResult.content!.length} bytes for CID: ${base58EncodedMultihashString}, base64url ID: ${base64urlEncodedMultihash}`);
    }

    return fetchResult;
  }

  /**
   * Fetch the content from IPFS.
   * This method also allows easy mocking in tests.
   */
  private async fetchContent (base58Multihash: string, maxSizeInBytes: number): Promise<FetchResult> {
    let response;
    try {
      // e.g. 'http://127.0.0.1:5001/api/v0/cat?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL&length=100000'
      const catUrl = url.resolve(this.uri, `/api/v0/cat?arg=${base58Multihash}&length=${maxSizeInBytes}`);
      response = await this.fetch(catUrl, { method: 'POST' });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { code: FetchResultCode.CasNotReachable };
      }

      console.error(`Unexpected error while fetching from IPFS for CID ${base58Multihash}, investigate and fix: ${SidetreeError.stringify(error)}`);
      return { code: FetchResultCode.NotFound };
    }

    if (response.status !== HttpStatus.OK) {
      const body = await ReadableStream.readAll(response.body);
      const json = JSON.parse(body.toString());

      if (json.Message === 'this dag node is a directory') {
        return { code: FetchResultCode.NotAFile };
      }

      console.info(`Recieved response code ${response.status} from IPFS for CID ${base58Multihash}: ${json})}`);
      return { code: FetchResultCode.NotFound };
    }

    const fetchResult: FetchResult = { code: FetchResultCode.Success };
    try {
      fetchResult.content = await ReadableStream.readAll(response.body, maxSizeInBytes);
      return fetchResult;
    } catch (error) {
      if (error instanceof SidetreeError &&
          error.code === SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded) {
        return { code: FetchResultCode.MaxSizeExceeded };
      }

      console.error(`unexpected error while reading response body for CID ${base58Multihash}, please investigate and fix: ${SidetreeError.stringify(error)}`);
      throw error;
    }
  }

  private async pinContent (hash: string) {
    // e.g. 'http://127.0.0.1:5001/api/v0/pin?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL'
    const pinUrl = url.resolve(this.uri, `/api/v0/pin?arg=${hash}`);
    await this.fetch(pinUrl, { method: 'POST' });
  }
}
