/**
 * DID Document public key purpose.
 */
enum PublicKeyPurpose {
  // TODO: #894 - Discuss `VerificationMethod` enum value in public key purpose.
  VerificationMethod = 'verificationMethod',
  Authentication = 'authentication',
  AssertionMethod = 'assertionMethod',
  CapabilityInvocation = 'capabilityInvocation',
  CapabilityDelegation = 'capabilityDelegation',
  KeyAgreement = 'keyAgreement'
}

export default PublicKeyPurpose;
