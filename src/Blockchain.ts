import Block from './Block';
import * as HttpStatus from 'http-status';
import nodeFetch from 'node-fetch';

/**
 * Interface to access the underlying blockchain.
 * This interface is mainly useful for creating a mock Blockchain for testing purposes.
 */
export interface Blockchain {
  /**
   * Writes the anchor file hash as a transaction to blockchain.
   */
  write (anchorFileHash: string): Promise<void>;

  /**
   * Gets the last block on the blockchain.
   */
  getLastBlock (): Promise<Block>;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class BlockchainClient implements Blockchain {
  private blocksUri: string; // e.g. https://127.0.0.1/blocks

  public constructor (public uri: string) {
    this.blocksUri = `${uri}/blocks`;
  }

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

  // TODO: Consider caching strategy since this will be invoked very frequently, especially by the Rooter.
  public async getLastBlock (): Promise<Block> {
    const uri = `${this.blocksUri}/last`; // e.g. https://127.0.0.1/blocks/last

    const response = await nodeFetch(uri);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching last block data from blockchain.');
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    return responseBody;
  }
}
