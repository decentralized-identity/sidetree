/**
 * Defines the internal generic document data structure that is agnostic to any particular external schema.
 */
export default interface InternalDocumentModel {
  didUniqueSuffix: string;
  document: any;
  recoveryKey: string;
  nextRecoveryOtpHash: string;
  nextUpdateOtpHash: string;
}
