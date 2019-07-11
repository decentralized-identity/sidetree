/**
 * Error codes.
 */
enum ErrorCode {
  AnchorFileBatchFileHashMissing = 'anchor_file_batch_file_hash_missing',
  AnchorFileBatchFileHashNotString = 'anchor_file_batch_file_hash_not_string',
  AnchorFileBatchFileHashUnsupported = 'anchor_file_batch_file_hash_unsupported',
  AnchorFileDidUniqueSuffixEntryInvalid = 'anchor_file_did_unique_suffix_entry_invalid',
  AnchorFileDidUniqueSuffixEntryNotString = 'anchor_file_did_unique_suffix_entry_not_string',
  AnchorFileDidUniqueSuffixesHasDuplicates = 'anchor_file_did_unique_suffixes_has_duplicates',
  AnchorFileDidUniqueSuffixesMissing = 'anchor_file_did_unique_suffixes_missing',
  AnchorFileDidUniqueSuffixesNotArray = 'anchor_file_did_unique_suffixes_not_array',
  AnchorFileExceededMaxOperationCount = 'anchor_file_exceeded_max_operation_count',
  AnchorFileHasUnknownProperty = 'anchor_file_has_unknown_property',
  AnchorFileMerkleRootMissing = 'anchor_file_merkle_root_missing',
  AnchorFileMerkleRootNotString = 'anchor_file_merkle_root_not_string',
  AnchorFileMerkleRootUnsupported = 'anchor_file_merkle_root_unsupported',
  AnchorFileNotJson = 'anchor_file_not_json',
  BatchWriterAlreadyHasOperationForDid = 'batch_writer_already_has_operation_for_did',
  InvalidTransactionNumberOrTimeHash = 'invalid_transaction_number_or_time_hash',
  OperationCreateInvalidDidDocument = 'operation_create_invalid_did_document',
  OperationExceedsMaximumSize = 'operation_exceeds_maximum_size',
  OperationHeaderMissingKid = 'operation_header_missing_kid',
  OperationHeaderMissingOrIncorrectAlg = 'operation_header_missing_or_incorrect_alg',
  OperationHeaderMissingOrIncorrectOperation = 'operation_header_missing_or_incorrect_operation',
  OperationMissingOrIncorrectPayload = 'operation_missing_or_incorrect_payload',
  OperationMissingOrIncorrectSignature = 'operation_missing_or_incorrect_signature',
  QueueingMultipleOperationsPerDidNotAllowed = 'queueing_multiple_operations_per_did_not_allowed'
}

export default ErrorCode;
