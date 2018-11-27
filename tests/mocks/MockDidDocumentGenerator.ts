export const didDocumentJson = {
  '@context': 'https://w3id.org/did/v1',
  'id': 'did:sidetree:ignored',
  'publicKey': [{
    'id': 'did:sidetree:didPortionIgnored#key-1',
    'type': 'RsaVerificationKey2018',
    'owner': 'did:sidetree:ignoredUnlessResolvable',
    'publicKeyPem': '-----BEGIN PUBLIC KEY...END PUBLIC KEY-----\r\n'
  }],
  'service': [{
    'type': 'IdentityHub',
    'publicKey': 'did:sidetree:ignored#key-1',
    'serviceEndpoint': {
      '@context': 'schema.identity.foundation/hub',
      '@type': 'UserServiceEndpoint',
      'instances': ['did:bar:456', 'did:zaz:789']
    }
  }]
};
