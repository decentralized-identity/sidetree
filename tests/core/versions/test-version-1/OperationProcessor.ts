import AnchoredOperationModel from '../../../../lib/core/models/AnchoredOperationModel';
import IOperationProcessor, { PatchResult } from '../../../../lib/core/interfaces/IOperationProcessor';

/**
 * Operation processor.
 */
export default class OperationProcessor implements IOperationProcessor {

  public constructor (private didMethodName: string) {
    console.debug(this.didMethodName);
  }

  async patch (
    anchoredOperationModel: AnchoredOperationModel,
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<PatchResult> {
    /* tslint:disable-next-line */
    throw new Error(`OperationProcessor: Not implemented. Version: TestVersion1. Inputs: ${anchoredOperationModel}, ${didDocumentReference}`);
  }
}
