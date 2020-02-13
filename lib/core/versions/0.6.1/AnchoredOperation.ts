import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import NamedAnchoredOperationModel from '../../models/NamedAnchoredOperationModel';
import Operation from './Operation';

/**
 * A class that represents an anchored Sidetree operation.
 */
export default class AnchoredOperation extends Operation implements NamedAnchoredOperationModel {
  /** The index this operation was assigned to in the batch. */
  public readonly operationIndex: number;
  /** The transaction number of the transaction this operation was batched within. */
  public readonly transactionNumber: number;
  /** The logical blockchain time that this opeartion was anchored on the blockchain */
  public readonly transactionTime: number;

  /**
   * Constructs an anchored peration if the operation buffer passes schema validation, throws error otherwise.
   */
  private constructor (anchoredOperationModel: AnchoredOperationModel) {
    super(anchoredOperationModel.operationBuffer);

    // Properties of an operation in a resolved transaction.
    this.operationIndex = anchoredOperationModel.operationIndex;
    this.transactionNumber = anchoredOperationModel.transactionNumber;
    this.transactionTime = anchoredOperationModel.transactionTime;
  }

  /**
   * Validates and creates an anchored operation that has been anchored on the blockchain.
   * @throws Error if given operation buffer fails any validation.
   */
  public static createAnchoredOperation (anchoredOperationModel: AnchoredOperationModel): AnchoredOperation {
    return new AnchoredOperation(anchoredOperationModel);
  }
}
