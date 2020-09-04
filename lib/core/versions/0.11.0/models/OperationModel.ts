import OperationType from '../../../enums/OperationType';

/**
 * Common model for a Sidetree operation.
 */
export default interface OperationModel {
  didUniqueSuffix: string;
  type: OperationType;
  operationBuffer: Buffer;
}
