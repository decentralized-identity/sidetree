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

All commitment values created for the commit/reveal function of Sidetree operations ****MUST**** be sufficiently random values (e.g. a 32 byte cryptographically secure string) and ****MUST**** be unique across operations, without reuse in the operational lineage of a DID.

Commitment values ****SHOULD**** be deterministically regenerable using the keys bound to a given DID. This eliminates the addition of another sensitive value User Agent applications would need to track, secure, and store, which subsequently reduces the possibility of loss.