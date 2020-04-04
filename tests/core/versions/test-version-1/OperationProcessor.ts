import AnchoredOperationModel from '../../../../lib/core/models/AnchoredOperationModel';
import DidState from '../../../../lib/core/models/DidState';
import IOperationProcessor from '../../../../lib/core/interfaces/IOperationProcessor';

/**
 * Operation processor.
 */
export default class OperationProcessor implements IOperationProcessor {

  async apply (
    operation: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined> {
    /* tslint:disable-next-line */
    throw new Error(`OperationProcessor: Not implemented. Version: TestVersion1. Inputs: ${operation}, ${didState}`);
  }
}
