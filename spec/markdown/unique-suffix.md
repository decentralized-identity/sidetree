## DID Suffix Composition

DID Methods based on the Sidetree protocol all share the same identifier format. The identifier is a hash of values from the [Create](#create) operation's _Suffix Data Object_ (generated using the [`HASH_ALGORITHM`](#hash-algorithm)), and composed of the following:

```mermaid
graph TD

ID(did:sidetree:EiBJz4qd3Lvof3boqBQgzhMDYXWQ_wZs67jGiAhFCiQFjw)
ID -->|Recovery Commitment| D(oqBQgzhMDw...)
ID -->|Create Operation Data Hash| E(xKwW0h6HjS...)
ID -->|Recovery Public Key| F(tB4W0i61jS...)
```