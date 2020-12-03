/**
 * Error codes used ONLY by this version of the protocol.
 */
export default {
  AnchoredDataIncorrectFormat: 'anchored_data_incorrect_format',
  AnchoredDataNumberOfOperationsGreaterThanMax: 'anchored_data_number_of_operations_greater_than_max',
  AnchoredDataNumberOfOperationsNotPositiveInteger: 'anchored_data_number_of_operations_not_positive_integer',
  BatchWriterAlreadyHasOperationForDid: 'batch_writer_already_has_operation_for_did',
  CasFileHashNotValid: 'cas_file_hash_not_valid',
  CasFileNotAFile: 'cas_file_not_a_file',
  CasFileNotFound: 'cas_file_not_found',
  CasFileTooLarge: 'cas_file_too_large',
  CasNotReachable: 'cas_not_reachable',
  ChunkFileDeltaCountIncorrect: 'chunk_file_delta_count_incorrect',
  ChunkFileDeltasNotArrayOfObjects: 'chunk_file_deltas_not_array_of_objects',
  ChunkFileDeltasPropertyNotArray: 'chunk_file_deltas_property_not_array',
  ChunkFileUnexpectedProperty: 'chunk_file_unexpected_property',
  CompressorMaxAllowedDecompressedDataSizeExceeded: 'compressor_max_allowed_decompressed_data_size_exceeded',
  CoreIndexFileCoreProofFileUriNotAllowed: 'core_index_file_core_proof_file_uri_not_allowed',
  CoreIndexFileCreatePropertyNotArray: 'core_index_file_create_property_not_array',
  CoreIndexFileDeactivatePropertyNotArray: 'core_index_file_deactivate_property_not_array',
  CoreIndexFileDecompressionFailure: 'core_index_file_decompression_failure',
  CoreIndexFileHasUnknownProperty: 'core_index_file_has_unknown_property',
  CoreIndexFileMultipleOperationsForTheSameDid: 'core_index_file_multiple_operations_for_the_same_did',
  CoreIndexFileNotJson: 'core_index_file_not_json',
  CoreIndexFileOperationCountExceededPaidLimit: 'core_index_file_operation_count_exceeded_paid_limit',
  CoreIndexFileProvisionalIndexFileUriMissing: 'core_index_file_provisional_index_file_uri_missing',
  CoreIndexFileRecoverPropertyNotArray: 'core_index_file_recover_property_not_array',
  CoreIndexFileUnexpectedPropertyInOperations: 'core_index_file_unexpected_property_in_operations',
  CoreIndexFileWriterLockIdExceededMaxSize: 'core_index_file_writer_lock_id_exceeded_max_size',
  CoreIndexFileWriterLockIdPropertyNotString: 'core_index_file_writer_lock_id_property_not_string',
  CoreProofFileDeactivatePropertyNotAnArray: 'core_proof_file_deactivate_property_not_an_array',
  CoreProofFileDecompressionFailure: 'core_proof_file_decompression_failure',
  CoreProofFileHasNoProofs: 'core_proof_file_has_no_proofs',
  CoreProofFileNotJson: 'core_proof_file_not_json',
  CoreProofFileOperationsNotFound: 'core_proof_file_operations_not_found',
  CoreProofFileProofCountNotTheSameAsOperationCountInCoreIndexFile: 'core_proof_file_proof_count_not_the_same_as_operation_count_in_core_index_file',
  CoreProofFileRecoverPropertyNotAnArray: 'core_proof_file_recover_property_not_an_array',
  CreateOperationMissingOrUnknownProperty: 'create_operation_missing_or_unknown_property',
  CreateOperationSuffixDataMissingOrNotString: 'create_operation_suffix_data_missing_or_not_string',
  CreateOperationTypeIncorrect: 'create_operation_type_incorrect',
  DeactivateOperationMissingOrInvalidDidUniqueSuffix: 'deactivate_operation_missing_or_invalid_did_unique_suffix',
  DeactivateOperationMissingOrUnknownProperty: 'deactivate_operation_missing_or_unknown_property',
  DeactivateOperationSignedDataMissingOrUnknownProperty: 'deactivate_operation_signed_data_missing_or_unknown_property',
  DeactivateOperationSignedDidUniqueSuffixMismatch: 'deactivate_operation_signed_did_unique_suffix_mismatch',
  DeactivateOperationTypeIncorrect: 'deactivate_operation_type_incorrect',
  DeltaExceedsMaximumSize: 'delta_exceeds_maximum_size',
  DeltaIsNotObject: 'delta_is_not_object',
  DeltaMissingOrNotString: 'delta_missing_or_not_string',
  DeltaMissingOrUnknownProperty: 'delta_missing_or_unknown_property',
  DidIncorrectPrefix: 'did_incorrect_prefix',
  DidInitialStateJcsIsNotJcs: 'did_initial_state_jcs_is_not_jcs',
  DidInitialStateJcsIsNotJson: 'did_initial_state_jcs_is_not_json',
  DidInitialStateValueContainsMoreThanOneDot: 'did_initial_state_value_contains_more_than_one_dot',
  DidInitialStateValueContainsNoDot: 'did_initial_state_value_contains_no_dot',
  DidInitialStateValueDoesNotContainTwoParts: 'did_initial_state_value_does_not_contain_two_parts',
  DidInvalidDidString: 'did_invalid_did_string',
  DidLongFormNoInitialStateFound: 'did_long_form_no_initial_state_found',
  DidLongFormOnlyInitialStateParameterIsAllowed: 'did_long_form_only_initial_state_parameter_is_allowed',
  DidLongFormOnlyOneQueryParamAllowed: 'did_long_form_only_one_query_param_allowed',
  DidNoUniqueSuffix: 'did_no_unique_suffix',
  DidNotFound: 'did_not_found',
  DidUniqueSuffixFromInitialStateMismatch: 'did_unique_suffix_from_initial_state_mismatch',
  DocumentComposerDocumentMissing: 'document_composer_document_missing',
  DocumentComposerIdNotString: 'document_composer_id_not_string',
  DocumentComposerIdNotUsingBase64UrlCharacterSet: 'document_composer_id_not_using_base64_url_character_set',
  DocumentComposerIdTooLong: 'document_composer_id_too_long',
  DocumentComposerInvalidSignature: 'document_composer_invalid_signature',
  DocumentComposerPatchMissingOrUnknownAction: 'document_composer_patch_missing_or_unknown_action',
  DocumentComposerPatchMissingOrUnknownProperty: 'document_composer_patch_missing_or_unknown_property',
  DocumentComposerPatchPublicKeyIdsNotArray: 'document_composer_patch_public_key_ids_not_array',
  DocumentComposerPatchServiceEndpointCannotBeAnArray: 'document_composer_patch_service_endpoint_cannot_be_an_array',
  DocumentComposerPatchServiceEndpointMustBeStringOrNonArrayObject: 'document_composer_patch_service_endpoint_must_be_string_or_non_array_object',
  DocumentComposerPatchServiceEndpointStringNotValidUri: 'document_composer_patch_service_endpoint_string_not_valid_uri',
  DocumentComposerPatchServiceIdNotUnique: 'document_composer_patch_service_id_not_unique',
  DocumentComposerPatchServiceIdsNotArray: 'document_composer_patch_service_ids_not_array',
  DocumentComposerPatchServiceTypeMissingOrUnknown: 'document_composer_patch_service_type_missing_or_unknown',
  DocumentComposerPatchServiceTypeNotString: 'document_composer_patch_service_type_not_string',
  DocumentComposerPatchServiceTypeTooLong: 'document_composer_patch_service_type_too_long',
  DocumentComposerPatchServicesNotArray: 'document_composer_patch_services_not_array',
  DocumentComposerPublicKeyIdDuplicated: 'document_composer_public_key_id_duplicated',
  DocumentComposerPublicKeyInvalidPurpose: 'document_composer_public_key_invalid_purpose',
  DocumentComposerPublicKeyPurposesDuplicated: 'document_composer_public_key_purposes_duplicated',
  DocumentComposerPublicKeyPurposesIncorrectType: 'document_composer_public_key_purposes_incorrect_type',
  DocumentComposerPublicKeyTypeMissingOrIncorrectType: 'document_composer_public_key_type_missing_or_incorrect_type',
  DocumentComposerPublicKeyUnknownProperty: 'document_composer_public_key_unknown_property',
  DocumentComposerPublicKeysNotArray: 'document_composer_public_keys_not_array',
  DocumentComposerServiceHasMissingOrUnknownProperty: 'document_composer_service_has_missing_or_unknown_property',
  DocumentComposerServiceNotArray: 'document_composer_service_not_array',
  DocumentComposerUnknownPropertyInDocument: 'document_composer_unknown_property_in_document',
  DocumentComposerUnknownPropertyInRemovePublicKeysPatch: 'document_composer_unknown_property_in_remove_public_keys_patch',
  DocumentComposerUnknownPropertyInRemoveServicesPatch: 'document_composer_unknown_property_in_remove_services_patch',
  DocumentComposerUpdateOperationDocumentPatchesNotArray: 'document_composer_update_operation_document_patches_not_array',
  DocumentNotJson: 'document_not_json',
  DocumentNotValidOriginalDocument: 'document_not_valid_original_document',
  EncoderValidateBase64UrlStringInputNotBase64UrlString: 'encoder_validate_base64_url_string_input_not_base64_url_string',
  EncoderValidateBase64UrlStringInputNotString: 'encoder_validate_base64_url_string_input_not_string',
  InputValidatorCasFileUriNotString: 'input_validator_cas_file_uri_not_string',
  InputValidatorCasFileUriUnsupported: 'input_validator_cas_file_uri_unsupported',
  InputValidatorInputCannotBeAnArray: 'input_validator_input_cannot_be_an_array',
  InputValidatorInputContainsNowAllowedProperty: 'input_validator_input_contains_now_allowed_property',
  InputValidatorInputIsNotAnObject: 'input_validator_input_is_not_an_object',
  JwkEs256kHasIncorrectLengthOfX: 'jwk_es256k_has_incorrect_length_of_x',
  JwkEs256kHasIncorrectLengthOfY: 'jwk_es256k_has_incorrect_length_of_y',
  JwkEs256kHasUnknownProperty: 'jwk_es256k_has_unknown_property',
  JwkEs256kMissingOrInvalidCrv: 'jwk_es256k_missing_or_invalid_crv',
  JwkEs256kMissingOrInvalidKty: 'jwk_es256k_missing_or_invalid_kty',
  JwkEs256kMissingOrInvalidTypeX: 'jwk_es256k_missing_or_invalid_type_x',
  JwkEs256kMissingOrInvalidTypeY: 'jwk_es256k_missing_or_invalid_type_y',
  JwkEs256kUndefined: 'jwk_es256k_undefined',
  JwsCompactJwsInvalid: 'jws_compact_jws_invalid',
  JwsCompactJwsNotString: 'jws_compact_jws_not_string',
  JwsFailedSignatureValidation: 'jws_failed_signature_validation',
  JwsPayloadNotBase64UrlString: 'jws_payload_not_base64_url_string',
  JwsProtectedHeaderMissingOrIncorrectAlg: 'jws_protected_header_missing_or_incorrect_alg',
  JwsProtectedHeaderMissingOrUnknownProperty: 'jws_protected_header_missing_or_unknown_property',
  JwsSignatureNotBase64UrlString: 'jws_signature_not_base64_url_string',
  MultihashNotLatestSupportedHashAlgorithm: 'multihash_not_latest_supported_hash_algorithm',
  MultihashUnsupportedHashAlgorithm: 'multihash_unsupported_hash_algorithm',
  OperationCountLessThanZero: 'operation_count_less_than_zero',
  OperationCreateInvalidDidDocument: 'operation_create_invalid_did_document',
  OperationCreatePayloadHasMissingOrInvalidNextRecoveryCommitment: 'operation_create_payload_has_missing_or_invalid_next_recovery_commitment',
  OperationCreatePayloadHasMissingOrInvalidNextUpdateCommitment: 'operation_create_payload_has_missing_or_invalid_next_update_commitment',
  OperationCreatePayloadMissingOrUnknownProperty: 'operation_create_payload_missing_or_unknown_property',
  OperationDocumentPatchesMissing: 'operation_document_patches_missing',
  OperationPayloadMissingOrIncorrectType: 'operation_payload_missing_or_incorrect_type',
  OperationProcessorCreateOperationDoesNotHaveRevealValue: 'operation_processor_create_operation_does_not_have_reveal_value',
  OperationProcessorUnknownOperationType: 'operation_processor_unknown_operation_type',
  OperationReferenceDidSuffixIsNotAString: 'operation_reference_did_suffix_is_not_a_string',
  OperationReferenceRevealValueIsNotAString: 'operation_reference_reveal_value_is_not_a_string',
  OperationTypeUnknownOrMissing: 'operation_type_unknown_or_missing',
  ProvisionalIndexFileChunkHasMissingOrUnknownProperty: 'provisional_index_file_chunk_has_missing_or_unknown_property',
  ProvisionalIndexFileChunksPropertyDoesNotHaveExactlyOneElement: 'provisional_index_file_chunks_property_does_not_have_exactly_one_element',
  ProvisionalIndexFileChunksPropertyMissingOrIncorrectType: 'provisional_index_file_chunks_property_missing_or_incorrect_type',
  ProvisionalIndexFileDecompressionFailure: 'provisional_index_file_decompression_failure',
  ProvisionalIndexFileDidReferenceDuplicatedWithCoreIndexFile: 'provisional_index_file_did_reference_duplicated_with_core_index_file',
  ProvisionalIndexFileHasUnknownProperty: 'provisional_index_file_has_unknown_property',
  ProvisionalIndexFileMultipleOperationsForTheSameDid: 'provisional_index_file_multiple_operations_for_the_same_did',
  ProvisionalIndexFileNotJson: 'provisional_index_file_not_json',
  ProvisionalIndexFileProvisionalProofFileUriNotAllowed: 'provisional_index_file_provisional_proof_file_uri_not_allowed',
  ProvisionalIndexFileUpdateOperationCountGreaterThanMaxPaidCount: 'provisional_index_file_update_operation_count_greater_than_max_paid_count',
  ProvisionalIndexFileUpdateOperationsNotArray: 'provisional_index_file_update_operations_not_array',
  ProvisionalProofFileDecompressionFailure: 'provisional_proof_file_decompression_failure',
  ProvisionalProofFileHasNoProofs: 'provisional_proof_file_has_no_proofs',
  ProvisionalProofFileNotJson: 'provisional_proof_file_not_json',
  ProvisionalProofFileOperationsNotFound: 'provisional_proof_file_operations_not_found',
  ProvisionalProofFileProofCountNotTheSameAsOperationCountInProvisionalIndexFile: 'provisional_proof_file_proof_count_not_the_same_as_operation_count_in_provisional_index_file',
  ProvisionalProofFileUpdatePropertyNotAnArray: 'provisional_proof_file_update_property_not_an_array',
  QueueingMultipleOperationsPerDidNotAllowed: 'queueing_multiple_operations_per_did_not_allowed',
  RecoverOperationMissingOrInvalidDidUniqueSuffix: 'recover_operation_missing_or_invalid_did_unique_suffix',
  RecoverOperationMissingOrUnknownProperty: 'recover_operation_missing_or_unknown_property',
  RecoverOperationSignedDataMissingOrUnknownProperty: 'recover_operation_signed_data_missing_or_unknown_property',
  RecoverOperationTypeIncorrect: 'recover_operation_type_incorrect',
  RequestHandlerUnknownOperationType: 'request_handler_unknown_operation_type',
  SuffixDataTypeInvalidCharacter: 'suffix_data_type_invalid_character',
  SuffixDataTypeIsNotString: 'suffix_data_type_is_not_string',
  SuffixDataTypeLengthGreaterThanFour: 'suffix_data_type_length_greater_than_four',
  TransactionFeePaidInvalid: 'transaction_fee_paid_invalid',
  TransactionFeePaidLessThanNormalizedFee: 'transaction_fee_paid_less_than_normalized_fee',
  TransactionProcessorPaidOperationCountExceedsLimit: 'transaction_processor_paid_operation_count_exceeds_limit',
  TransactionsNotInSameBlock: 'transactions_not_in_same_block',
  UpdateOperationMissingDidUniqueSuffix: 'update_operation_missing_did_unique_suffix',
  UpdateOperationMissingOrUnknownProperty: 'update_operation_missing_or_unknown_property',
  UpdateOperationSignedDataHasMissingOrUnknownProperty: 'update_operation_signed_data_has_missing_or_unknown_property',
  UpdateOperationTypeIncorrect: 'update_operation_type_incorrect',
  ValueTimeLockVerifierInvalidNumberOfOperations: 'value_time_lock_verifier_invalid_number_of_operations',
  ValueTimeLockVerifierTransactionTimeOutsideLockRange: 'value_time_lock_verifier_transaction_time_outside_lock_range',
  ValueTimeLockVerifierTransactionWriterLockOwnerMismatch: 'value_time_lock_verifier_transaction_writer_lock_owner_mismatch'
};
