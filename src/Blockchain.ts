import * as HttpStatus from 'http-status';
import nodeFetch from 'node-fetch';
import { config, ConfigKey } from './Config';

/**
 * Interface to access the underlying blockchain.
 * This interface is mainly useful for creating a mock Blockchain for testing purposes.
 */
export interface Blockchain {
  /**
   * Writes the anchor file hash as a transaction to blockchain.
   */
  write (anchorFileHash: string): Promise<void>;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class RestBlockchain implements Blockchain {

  public constructor (public uri: string) { }

  public async write (anchorFileHash: string): Promise<void> {
    const anchorFileHashObject = {
      anchorFileHash: anchorFileHash
    };

    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(anchorFileHashObject)),
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await nodeFetch(this.uri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error writing anchor file hash to blockchain.');
    }
  }
}

const blockchain = new RestBlockchain(config[ConfigKey.BlockchainNodeUri]);
export default blockchain ;
