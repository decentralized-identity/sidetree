import PublicKeyPurpose from '../PublicKeyPurpose';

/**
 * Data model representing a public key in the 'publicKeys' array in patches.
 */
export default interface PublicKeyModel {
  id: string;
  type: string;
  publicKeyJwk: any;
  purposes?: PublicKeyPurpose[];
}
