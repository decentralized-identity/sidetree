/**
 * Error codes.
 */
enum ErrorCode {
  InvalidTransactionNumberOrTimeHash = 'invalid_transaction_number_or_time_hash',
  OperationExceedsMaximumSize = 'operation_exceeds_maximum_size',
  QueueingMultipleOperationsPerDidNotAllowed = 'queueing_multiple_operations_per_did_not_allowed'
}

export default ErrorCode;
