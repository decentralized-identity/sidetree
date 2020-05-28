/**
 * Model for representing a SECP256K1 key in a JWK format.
 */
export default interface JwkEs256k {
  kty: string;
  crv: string;
  x: string;
  y: string;
  d?: string; // Only used by a private key.
}
