import Transaction from '../../src/Transaction';
import { DidCache } from '../../src/DidCache';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation } from '../../src/Operation';

/**
 * Mock DID cache class for testing.
 */
export default class MockDidCache implements DidCache {
  public get lastProcessedTransaction (): Transaction | undefined {
    return undefined;
  }

  public apply (_operation: WriteOperation): string | undefined {
    return undefined;
  }

  public rollback (_transactionNumber: number): void {
    return;
  }

  public async resolve (_did: string): Promise<DidDocument | undefined> {
    return undefined;
  }

  public async lookup (_versionId: string): Promise<DidDocument | undefined> {
    return undefined;
  }

  public async first (_versionId: string): Promise<string | undefined> {
    return undefined;
  }

  public async last (_versionId: string): Promise<string | undefined> {
    return undefined;
  }

  public async prev (_versionId: string): Promise<string | undefined> {
    return undefined;
  }

  public async next (_versionId: string): Promise<string | undefined> {
    return undefined;
  }
}
