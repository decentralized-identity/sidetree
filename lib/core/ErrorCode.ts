/**
 * Error codes used by Sidetree core service.
 */
export default {
  BatchSchedulerWriteUnexpectedError: 'batch_scheduler_write_unexpected_error',
  BlockchainGetFeeResponseNotOk: 'blockchain_get_fee_response_not_ok',
  BlockchainGetLatestTimeResponseNotOk: 'blockchain_get_latest_time_response_not_ok',
  BlockchainGetLockResponseNotOk: 'blockchain_get_lock_response_not_ok',
  BlockchainGetWriterLockResponseNotOk: 'blockchain_get_writer_lock_response_not_ok',
  BlockchainReadInvalidArguments: 'blockchain_read_invalid_arguments',
  BlockchainReadResponseBodyNotJson: 'blockchain_read_response_body_not_json',
  BlockchainReadResponseNotOk: 'blockchain_read_response_not_ok',
  BlockchainWriteUnexpectedError: 'blockchain_write_unexpected_error',
  DatabaseDowngradeNotAllowed: 'database_downgrade_not_allowed',
  VersionManagerVersionStringNotFound: 'version_manager_version_string_not_found',
  VersionManagerVersionMetadataIncorrectType: 'version_manager_version_metadata_incorrect_type'
};
