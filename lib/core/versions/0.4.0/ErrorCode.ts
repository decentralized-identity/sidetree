/**
 * Error codes used ONLY by this version of the protocol.
 */
export default {
  AnchorFileBatchFileHashMissing: 'anchor_file_batch_file_hash_missing',
  AnchorFileBatchFileHashNotString: 'anchor_file_batch_file_hash_not_string',
  AnchorFileBatchFileHashUnsupported: 'anchor_file_batch_file_hash_unsupported',
  AnchorFileDidUniqueSuffixEntryNotString:
    'anchor_file_did_unique_suffix_entry_not_string',
  AnchorFileDidUniqueSuffixesHasDuplicates:
    'anchor_file_did_unique_suffixes_has_duplicates',
  AnchorFileDidUniqueSuffixesMissing: 'anchor_file_did_unique_suffixes_missing',
  AnchorFileDidUniqueSuffixesNotArray:
    'anchor_file_did_unique_suffixes_not_array',
  AnchorFileDidUniqueSuffixTooLong: 'anchor_file_did_unique_suffix_too_long',
  AnchorFileExceededMaxOperationCount:
    'anchor_file_exceeded_max_operation_count',
  AnchorFileHasUnknownProperty: 'anchor_file_has_unknown_property',
  AnchorFileMerkleRootMissing: 'anchor_file_merkle_root_missing',
  AnchorFileMerkleRootNotString: 'anchor_file_merkle_root_not_string',
  AnchorFileMerkleRootUnsupported: 'anchor_file_merkle_root_unsupported',
  AnchorFileNotJson: 'anchor_file_not_json',
  BatchWriterAlreadyHasOperationForDid:
    'batch_writer_already_has_operation_for_did',
  OperationCreateInvalidDidDocument: 'operation_create_invalid_did_document',
  OperationExceedsMaximumSize: 'operation_exceeds_maximum_size',
  OperationHeaderMissingKid: 'operation_header_missing_kid',
  OperationHeaderMissingOrIncorrectAlg:
    'operation_header_missing_or_incorrect_alg',
  OperationHeaderMissingOrIncorrectOperation:
    'operation_header_missing_or_incorrect_operation',
  OperationMissingOrIncorrectPayload: 'operation_missing_or_incorrect_payload',
  OperationMissingOrIncorrectSignature:
    'operation_missing_or_incorrect_signature',
  OperationUpdatePayloadMissingOrInvalidDidUniqueSuffixType:
    'operation_update_payload_missing_or_invalid_did_unique_suffix_type',
  OperationUpdatePayloadMissingOrInvalidPreviousOperationHashType:
    'operation_update_payload_missing_or_invalid_previous_operation_hash_type',
  OperationUpdatePayloadMissingOrUnknownProperty:
    'operation_update_payload_missing_or_unknown_property',
  OperationUpdatePatchesNotArray: 'operation_update_patches_not_array',
  OperationUpdatePatchMissingOrUnknownAction:
    'operation_update_patch_missing_or_unknown_action',
  OperationUpdatePatchMissingOrUnknownProperty:
    'operation_update_patch_missing_or_unknown_property',
  OperationUpdatePatchPublicKeyHexMissingOrIncorrect:
    'operation_update_patch_public_key_hex_missing_or_incorrect',
  OperationUpdatePatchPublicKeyIdNotString:
    'operation_update_patch_public_key_id_not_string',
  OperationUpdatePatchPublicKeyMissingOrUnknownProperty:
    'operation_update_patch_public_key_missing_or_unknown_property',
  OperationUpdatePatchPublicKeysNotArray:
    'operation_update_patch_public_keys_not_array',
  OperationUpdatePatchPublicKeyTypeMissingOrUnknown:
    'operation_update_patch_public_key_type_missing_or_unknown',
  OperationUpdatePatchServiceEndpointNotDid:
    'operation_update_patch_service_endpoint_not_did',
  OperationUpdatePatchServiceEndpointsNotArray:
    'operation_update_patch_service_endpoints_not_array',
  OperationUpdatePatchServiceTypeMissingOrUnknown:
    'operation_update_patch_service_type_missing_or_unknown',
  QueueingMultipleOperationsPerDidNotAllowed:
    'queueing_multiple_operations_per_did_not_allowed'
};
