import * as crypto from 'crypto';
import * as HttpStatus from 'http-status';
import * as url from 'url';
import base64url from 'base64url';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';
import ICas from './interfaces/ICas';
import IpfsErrorCode from '../ipfs/IpfsErrorCode';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';

const multihashes = require('multihashes');

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export default class Cas implements ICas {
  private fetch = nodeFetch;

  public constructor (public uri: string) { }

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

    try {
      const fetchResult = await this.fetchContent(base58EncodedMultihashString, maxSizeInBytes);

      // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already existing object does not create a duplicate.
      if (fetchResult.code === FetchResultCode.Success) {
        await this.pinContent(base58EncodedMultihashString);
        console.log(`Read and pinned ${fetchResult.content!.length} byte content for IPFS CID: ${base58EncodedMultihashString}, base64url ID: ${base64urlEncodedMultihash}`);
      }

      return fetchResult;
    } catch {
      return {
        code: FetchResultCode.CasNotReachable
      };
    }
  }

  /**
   * Fetch the content from IPFS.
   * This method also allows easy mocking in tests.
   */
  private async fetchContent (base58Multihash: string, maxSizeInBytes: number): Promise<FetchResult> {
    let response;
    try {
      const catUrl = url.resolve(this.uri, `/api/v0/cat?arg=${base58Multihash}`); // e.g. 'http://127.0.0.1:5001/api/v0/cat?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL'
      response = await this.fetch(catUrl, { method: 'POST' });
    } catch (error) {
      console.debug(`Error thrown while downloading content from IPFS for CID ${base58Multihash}: ${SidetreeError.stringify(error)}`);
      return { code: FetchResultCode.NotFound };
    }

    const fetchResult: FetchResult = { code: FetchResultCode.Success };
    try {
      fetchResult.content = await ReadableStream.read(response.body, maxSizeInBytes);
      return fetchResult;
    } catch (error) {
      if (error instanceof SidetreeError &&
          error.code === SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded) {
        return { code: FetchResultCode.MaxSizeExceeded };
      }

      console.error(`unexpected error thrown for CID ${base58Multihash}, please investigate and fix: ${SidetreeError.stringify(error)}`);
      throw error;
    }
  }

  private async pinContent (hash: string) {
    const pinUrl = url.resolve(this.uri, `/api/v0/pin?arg=${hash}`); // e.g. 'http://127.0.0.1:5001/api/v0/pin?arg=QmPPsg8BeJdqK2TnRHx5L2BFyjmFr9FK6giyznNjdL93NL'
    await this.fetch(pinUrl, { method: 'POST' });
  }
}
