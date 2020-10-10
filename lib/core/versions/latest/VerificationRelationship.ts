/**
 * Sidetree public key verificationRelationship.
 */
enum VerificationRelationship {
  VerificationMethod = 'verificationMethod',
  Authentication = 'authentication',
  AssertionMethod = 'assertionMethod',
  CapabilityInvocation = 'capabilityInvocation',
  CapabilityDelegation = 'capabilityDelegation',
  KeyAgreement = 'keyAgreement'
}

export default VerificationRelationship;
