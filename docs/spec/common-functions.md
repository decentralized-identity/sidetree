## Common Functions

The following is a list of functional procedures that are commonly used across the protocol. These functions are defined once here and referenced throughout the specification, wherever an implementer must invoke them to comply with normative processes.

### Hashing Process

All data hashed within the bounds of the protocol follow the same procedural steps, and yield a consistently encoded output. Given a data value, the following steps are used to generated a hashed output:

1. Generate a hash of the data value using the [`HASH_PROTOCOL`](#hash-protocol) with the [`HASH_ALGORITHM`](#hash-algorithm).
2. Encode the resulting output using the [`DATA_ENCODING_SCHEME`](#data-encoding-scheme).
3. Return the encoded hashing output.

Pseudo-code example using current protocol defaults:

```js
let HashingOutput = Base64URL( Multihash(DATA, 'sha2-256') );
```

### Commitment Value Generation

The values used as the revealed secrets for Sidetree's commit/reveal mechanism ****MUST**** be the [JCS canonicalized](https://tools.ietf.org/html/draft-rundgren-json-canonicalization-scheme-17) [IETF RFC 7517](https://tools.ietf.org/html/rfc7517) JWK representations of cryptographic public keys. Implementers and wallets ****SHOULD NOT**** reuse keypairs across recovery invocations, and ****MUST NOT**** reuse commitment values (hashes of the JWK reveal values) across the entire lifetime of a DID.

The secret JWK values published during the reveal phase of Sidetree's commit/reveal mechanism ****SHOULD**** be deterministically regenerable, to minimize the number of sensitive values User Agent wallet applications need to track, secure, and store. The most common way to allow for a regenerable JWK value is to use a key derivation scheme, wherein the JWK value that was committed in the commitment phase is able to be regenerated at a later time (e.g. hardened BIP32 HD key generation).