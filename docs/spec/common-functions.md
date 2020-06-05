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

[Commitment schemes](#commitment-scheme) are used by the Sidetree protocol in important ways to preserve the integrity of operations and assist in key recovery.

#### Operation Commitment Scheme { #operation-commitment-scheme }

The following section defines the [commitment scheme](#commitment-scheme) for generating an [operation commitment](#operation-commitment) along with 
how the [operation commit value](#operation-commit-value) is generated.

The [operation commit value](#commit-value) used to generate a [operation commitment](#next-operation-commitment) ****MUST**** be sufficiently randomly generated such that there is negligible probability that the same value will be used in another operation.

The length of the [coperation ommit value](#operation-commit-value) used to generate a [operation commitment](#operation-commitment) ****MUST**** be of the length equal to that as defined by [OPERATION_COMMIT_VALUE_SIZE](#operation-commit-value-size).

The [operation commitment](#next-operation-commitment) is obtained by hashing the [operation commit value](#operation-commit-value) using the defined [HASH_ALGORITHM](#hash-algorithm).

The [commit value](#commit-value) used to generate a [operation commitment](#next-operation-commitment) ****SHOULD**** be deterministically re-generable using information associated to the DID to which the operation pertains to, in order to reduce the possibility of irrecoverable loss.

#### Recovery Commitment Scheme { #recovery-commitment-scheme }

The following section defines the [commitment scheme](#commitment-scheme) for generating a [recovery commitment](#recovery-commitment) from a [recovery key pair](#recovery-key-pair).

The public key of the [recovery key pair](#recovery-key-pair) used to generated a [recovery commitment](#recovery-commitment) ****MUST**** be in the form of a valid [JWK](https://tools.ietf.org/html/rfc7517), in this form the public key ****MUST**** then be [canonicalized](#canonicalized) using [JSON Canonicalization Scheme](https://tools.ietf.org/html/draft-rundgren-json-canonicalization-scheme-17), the output value of this [canoncalization](#canonicalization) ****MUST**** then be hashed using the defined [HASH_ALGORITHM](#hash-algorithm) to produce the [recovery commitment](#recovery-commitment).

Implementers ****MUST NOT**** re-use [recovery key pairs](#recovery-key-pairs) across different recovery invocations.
