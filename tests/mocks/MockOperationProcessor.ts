import { OperationProcessor } from '../../src/OperationProcessor';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { WriteOperation } from '../../src/Operation';

/**
 * Mock OperationProcessor class for testing.
 */
export default class MockOperationProcessor implements OperationProcessor {
  private didDocument?: DidDocument;

  public process (_operation: WriteOperation): string | undefined {
    return undefined;
  }

  public rollback (_transactionNumber: number): void {
    return;
  }

  public async resolve (_didUniquePortion: string): Promise<DidDocument | undefined> {
    return this.didDocument;
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

  public async previous (_versionId: string): Promise<string | undefined> {
    return undefined;
  }

  public async next (_versionId: string): Promise<string | undefined> {
    return undefined;
  }

  /**
   * Sets the DID Document to be returned when resolve() method is invoked.
   * For test purposes.
   */
  public setResolveReturnValue (didDocument?: DidDocument) {
    this.didDocument = didDocument;
  }
}
