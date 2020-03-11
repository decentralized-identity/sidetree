import DocumentState from '../../../../lib/core/models/DocumentState';
import IOperationProcessor from '../../../../lib/core/interfaces/IOperationProcessor';
import NamedAnchoredOperationModel from '../../../../lib/core/models/NamedAnchoredOperationModel';

/**
 * Operation processor.
 */
export default class OperationProcessor implements IOperationProcessor {

  async apply (
    operation: NamedAnchoredOperationModel,
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined> {
    /* tslint:disable-next-line */
    throw new Error(`OperationProcessor: Not implemented. Version: TestVersion1. Inputs: ${operation}, ${documentState}`);
  }
}
