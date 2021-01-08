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

### Commitment Schemes

[Commitment schemes](#commitment-scheme) are used by the Sidetree protocol in important ways to preserve the integrity of operations and assist in recovery.

#### Public Key Commitment Scheme

The following steps define the [commitment scheme](#commitment-scheme) for generating a [public key commitment](#public-key-commitment) from a public key.

1. Encode the public key into the form of a valid [JWK](https://tools.ietf.org/html/rfc7517).
2. Canonicalize the [JWK](https://tools.ietf.org/html/rfc7517) encoded public key using the implementation's [`JSON_CANONICALIZATION_SCHEME`](#json-canonicalization-scheme).
3. Use the implementation's [`HASH_PROTOCOL`](#hash-protocol) to the hash the canonicalized public key to generate the [`REVEAL_VALUE`](#reveal-value), then hash the resulting hash value again using the implementation's [`HASH_PROTOCOL`](#hash-protocol) to produce the [public key commitment](#public-key-commitment).

Implementers ****MUST NOT**** re-use public key JWK payloads across different commitment invocations.