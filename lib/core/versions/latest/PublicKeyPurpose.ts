/**
 * DID Document public key purpose.
 */
enum PublicKeyPurpose {
  VerificationMethod = 'verificationMethod',
  Authentication = 'authentication',
  AssertionMethod = 'assertionMethod',
  CapabilityInvocation = 'capabilityInvocation',
  CapabilityDelegation = 'capabilityDelegation',
  KeyAgreement = 'keyAgreement'
}

export default PublicKeyPurpose;
