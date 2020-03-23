/**
 * Error codes used ONLY by this version of the protocol.
 */
export default {
  AnchoredDataIncorrectFormat: 'anchored_data_incorrect_format',
  AnchoredDataNumberOfOperationsGreaterThanMax: 'anchored_data_number_of_operations_greater_than_max',
  AnchoredDataNumberOfOperationsLessThanZero: 'anchored_data_number_of_operations_less_than_zero',
  AnchoredDataNumberOfOperationsNotFourBytes: 'anchored_data_number_of_operations_not_four_bytes',
  AnchoredDataNumberOfOperationsNotInteger: 'anchored_data_number_of_operations_not_integer',
  AnchorFileCreateOperationsNotArray: 'anchor_file_create_operations_not_array',
  AnchorFileDecompressionFailure: 'anchor_file_decompression_failed',
  AnchorFileHasUnknownProperty: 'anchor_file_has_unknown_property',
  AnchorFileMapFileHashMissing: 'anchor_file_map_file_hash_missing',
  AnchorFileMapFileHashNotString: 'anchor_file_map_file_hash_not_string',
  AnchorFileMapFileHashUnsupported: 'anchor_file_map_file_hash_unsupported',
  AnchorFileMissingOperationsProperty: 'anchor_file_did_unique_suffixes_missing',
  AnchorFileMultipleOperationsForTheSameDid: 'anchor_file_multiple_operations_for_the_same_did',
  AnchorFileNotJson: 'anchor_file_not_json',
  AnchorFileOperationCountExceededPaidLimit: 'anchor_file_operation_count_exceeded_paid_limit',
  AnchorFileRecoverOperationsNotArray: 'anchor_file_recover_operations_not_array',
  AnchorFileRevokeOperationsNotArray: 'anchor_file_revoke_operations_not_array',
  AnchorFileUnexpectedPropertyInOperations: 'anchor_file_unexpected_property_in_operations',
  AnchorFileWriterLockIPropertyNotString: 'anchor_file_writer_lock_id_property_not_string',
  BatchFileOperationDataSizeExceedsLimit: 'batch_file_operation_data_size_exceeds_limit',
  BatchFileOperationDataNotArrayOfStrings: 'batch_file_operation_data_not_array_of_string',
  BatchFileOperationDataPropertyNotArray: 'batch_file_operation_data_property_not_array',
  BatchFileUnexpectedProperty: 'batch_file_unexpected_property',
  BatchWriterAlreadyHasOperationForDid: 'batch_writer_already_has_operation_for_did',
  CasFileHashNotValid: 'cas_file_hash_not_valid',
  CasFileNotAFile: 'cas_file_not_a file',
  CasFileNotFound: 'cas_file_not_found',
  CasFileTooLarge: 'cas_file_too_large',
  CasNotReachable: 'cas_not_reachable',
  CreateOperationMissingOrUnknownProperty: 'create_operation_missing_or_unknown_property',
  CreateOperationDataMissingOrNotString: 'create_operation_data_missing_or_not_string',
  CreateOperationDataMissingOrUnknownProperty: 'create_operation_data_missing_or_unknown_property',
  CreateOperationDocumentMissing: 'create_operation_document_missing',
  CreateOperationSuffixDataMissingOrNotString: 'create_operation_suffix_data_missing_or_not_string',
  CreateOperationSuffixDataMissingOrUnknownProperty: 'create_operation_suffix_data_missing_or_unknown_property',
  CreateOperationTypeIncorrect: 'create_operation_type_incorrect',
  DidIncorrectPrefix: 'did_incorrect_prefix',
  DidInvalidDidString: 'did_invalid_did_string',
  DidInvalidMethodName: 'did_invalid_method_name',
  DidLongFormOnlyInitialStateParameterIsAllowed: 'did_long_form_only_initial_values_parameter_is_allowed',
  DidNoUniqueSuffix: 'did_no_unique_suffix',
  DidUniqueSuffixFromInitialStateMismatch: 'did_unique_suffix_from_initial_values_mismatch',
  DocumentComposerInvalidSignature: 'document_composer_invalid_signature',
  DocumentComposerKeyNotFound: 'document_composer_key_not_found',
  DocumentComposerPatchMissingOrUnknownAction: 'document_composer_patch_missing_or_unknown_action',
  DocumentComposerPatchMissingOrUnknownProperty: 'document_composer_patch_missing_or_unknown_property',
  DocumentComposerPatchPublicKeyControllerNotAllowed: 'document_composer_patch_public_key_controller_not_allowed',
  DocumentComposerPatchPublicKeyHexMissingOrIncorrect: 'document_composer_patch_public_key_hex_missing_or_incorrect',
  DocumentComposerPatchPublicKeyIdNotString: 'document_composer_patch_public_key_id_not_string',
  DocumentComposerPatchPublicKeyMissingOrUnknownProperty: 'document_composer_patch_public_key_missing_or_unknown_property',
  DocumentComposerPatchPublicKeysNotArray: 'document_composer_patch_public_keys_not_array',
  DocumentComposerPatchPublicKeyTypeMissingOrUnknown: 'document_composer_patch_public_key_type_missing_or_unknown',
  DocumentComposerPatchServiceEndpointNotString: 'document_composer_patch_service_endpoint_not_string',
  DocumentComposerPatchServiceEndpointsNotArray: 'document_composer_patch_service_endpoints_not_array',
  DocumentComposerPatchServiceTypeMissingOrUnknown: 'document_composer_patch_service_type_missing_or_unknown',
  DocumentComposerUpdateOperationDocumentPatchNotArray: 'document_composer_update_operation_document_patch_not_array',
  DocumentIncorretEncodedFormat: 'document_incorrect_encoded_format',
  DocumentNotJson: 'document_not_json',
  DocumentNotValidOriginalDocument: 'document_not_valid_original_document',
  JwsProtectedHeaderMissingOrIncorrectAlg: 'jws_protected_header_missing_or_incorrect_alg',
  JwsProtectedHeaderMissingOrIncorrectKid: 'jws_protected_header_missing_or_incorrect_kid',
  JwsProtectedHeaderMissingOrUnknownProperty: 'jws_protected_header_missing_or_unknown_property',
  JwsMissingOrIncorrectPayload: 'jws_missing_or_incorrect_payload',
  JwsMissingOrIncorrectSignature: 'jws_missing_or_incorrect_signature',
  MapFileBatchFileHashMissingOrIncorrectType: 'map_file_batch_file_hash_missing_or_incorrect_type',
  MapFileDecompressionFailure: 'map_file_decompression_failure',
  MapFileHasUnknownProperty: 'map_file_has_unknown_property',
  MapFileMultipleOperationsForTheSameDid: 'map_file_multiple_operations_for_the_same_did',
  MapFileNotJson: 'map_file_not_json',
  MapFileUpdateOperationsNotArray: 'map_file_update_operations_not_array',
  MultihashNotLatestSupportedHashAlgorithm: 'multihash_not_latest_supported_hash_algorithm',
  MultihashUnsupportedHashAlgorithm: 'multihash_unsupported_hash_algorithm',
  OperationCreateInvalidDidDocument: 'operation_create_invalid_did_document',
  OperationCountLessThanZero: 'operation_count_less_than_zero',
  OperationCreatePayloadHasMissingOrInvalidNextRecoveryOtpHash: 'operation_create_payload_has_missing_or_invalid_next_recovery_otp_hash',
  OperationCreatePayloadHasMissingOrInvalidNextUpdateOtpHash:  'operation_create_payload_has_missing_or_invalid_next_update_otp_hash',
  OperationCreatePayloadMissingOrUnknownProperty: 'operation_create_payload_missing_or_unknown_property',
  OperationPayloadMissingOrIncorrectType: 'operation_payload_missing_or_incorrect_type',
  OperationProcessorUnknownOperationType: 'operation_processor_unknown_operation_type',
  OperationRecoveryKeyInvalid: 'operation_recovery_key_invalid',
  OperationRecoveryKeyUndefined: 'operation_recovery_key_undefined',
  OperationTypeUnknownOrMissing: 'operation_type_unknown_or_missing',
  QueueingMultipleOperationsPerDidNotAllowed: 'queueing_multiple_operations_per_did_not_allowed',
  RecoverOperationDataMissingOrNotString: 'recover_operation_data_missing_or_not_string',
  RecoverOperationDataMissingOrUnknownProperty: 'recover_operation_data_missing_or_unknown_property',
  RecoverOperationDocumentMissing: 'recover_operation_document_missing',
  RecoverOperationMissingOrInvalidDidUniqueSuffix: 'recover_operation_missing_or_invalid_did_unique_suffix',
  RecoverOperationMissingOrUnknownProperty: 'recover_operation_missing_or_unknown_property',
  RecoverOperationRecoveryOtpMissingOrInvalidType: 'recover_operation_recovery_otp_missing_or_invalid_type',
  RecoverOperationRecoveryOtpTooLong: 'recover_operation_recovery_otp_too_long',
  RecoverOperationSignedDataMissingOrUnknownProperty: 'recover_operation_signed_data_missing_or_unknown_property',
  RecoverOperationTypeIncorrect: 'recover_operation_type_incorrect',
  RequestHandlerOperationDataExceedsMaximumSize: 'request_handler_operation_data_exceeds_maximum_size',
  RevokeOperationMissingOrInvalidDidUniqueSuffix: 'revoke_operation_missing_or_invalid_did_unique_suffix',
  RevokeOperationMissingOrUnknownProperty: 'revoke_operation_missing_or_unknown_property',
  RevokeOperationRecoveryOtpMissingOrInvalidType: 'revoke_operation_recovery_otp_missing_or_invalid_type',
  RevokeOperationRecoveryOtpTooLong: 'revoke_operation_recovery_otp_too_long',
  RevokeOperationSignedDataMissingOrUnknownProperty: 'revoke_operation_signed_data_missing_or_unknown_property',
  RevokeOperationSignedDidUniqueSuffixMismatch: 'revoke_operation_signed_did_unique_suffix_mismatch',
  RevokeOperationSignedRecoveryOtpMismatch: 'revoke_operation_signed_recovery_otp_mismatch',
  RevokeOperationTypeIncorrect: 'revoke_operation_type_incorrect',
  TransactionFeePaidInvalid: 'transaction_fee_paid_is_invalid',
  TransactionFeePaidLessThanNormalizedFee: 'transaction_fee_paid_less_than_normalized_fee',
  TransactionProcessorPaidOperationCountExceedsLimit: 'transaction_processor_paid_operation_count_exceeds_limit',
  TransactionsNotInSameBlock: 'transactions_not_in_same_block',
  UpdateOperationDataMissingOrNotString: 'update_operation_data_missting_or_not_string',
  UpdateOperationDataMissingOrUnknownProperty: 'update_operation_data_missing_or_unknown_property',
  UpdateOperationDocumentPatchMissing: 'update_operation_document_patch_missing',
  UpdateOperationMissingDidUniqueSuffix: 'update_operation_missing_did_unique_suffix',
  UpdateOperationMissingOrUnknownProperty: 'update_operation_missing_or_unknown_property',
  UpdateOperationTypeIncorrect: 'update_operation_type_incorrect',
  UpdateOperationUpdateOtpMissingOrInvalidType: 'update_operation_update_otp_missing_or_invalid_type',
  UpdateOperationUpdateOtpTooLong: 'update_operation_update_otp_too_long',
  ValueTimeLockVerifierInvalidNumberOfOperations: 'value_time_lock_verifierInvalid_number_of_operations',
  ValueTimeLockVerifierTransactionTimeOutsideLockRange: 'value_time_lock_verifiertarget_transaction_time_outside_lock_range',
  ValueTimeLockVerifierTransactionWriterLockOwnerMismatch: 'value_time_lock_verifiertransaction_owner_lock_writer_mismatch'
};
