import VerificationRelationship from '../VerificationRelationship';

/**
 * Data model representing a public key in the 'publicKey' array in patches.
 */
export default interface PublicKeyModel {
  id: string;
  type: string;
  publicKeyJwk: any;
  verificationRelationship: VerificationRelationship[];
}
