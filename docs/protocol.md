# DEPRECATED HISTORICAL DOCUMENT - DO NOT USE

OFFICIAL SIDETREE SPECIFICATION HERE: https://identity.foundation/sidetree/spec/


## DDoS Attack & Mitigation

Given that Sidetree is designed to enable operations to be performed at large volumes with cheap unit costs, DDoS is a real threat to the system.

Without any mitigation strategy, malicious but specification adherent nodes can create and broadcast operation batches that are not intended for any other purpose than to force other observing nodes to process their operations in accordance with the specification.

Sidetree specification defines the following mechanisms to enable scaling, while preventing DDoS attacks:

#### Rate limiting
   
   To prevent spam attack causing transaction and operation stores to grow at an unhealthy rate, 2 types of rate limiting is put in place. 

   1. writer rate limiting
   Each writer is allowed 1 transaction per transaction time. If a writer has more than 1 transaction, the one with the lowest transaction number is chosen to be considered.

   2. operation and transaction rate limiting
   After getting 1 transaction per writer, transaction and operation rate limiting is applied. A cap is put on the number of operations and transactions allowed to be observed in a transaction time. The selection logic when the caps are exceeded is the following:
   
   higher fee per transaction comes first, if transaction fee is the same, lower transaction number comes first, in that order, fill the cap and ignore the rest.
   
   By picking the transactions with higher transaction fee, it encourages batching, while allowing small transactions to have the opportunity to also be included if they are willing to pay a slightly higher transaction fee. Alternatives to this approach are highest fee per operation and first comes first serve, but they don't encourage batching and discourage writing near the end of a transaction time.

#### Maximum batch size
   
   By defining a maximum number of operations per batch, the strategy circumvents participants to anchor arbitrarily large trees on the system. At its core, this mitigation strategy forces the attacker to deal with the organic economic pressure exerted by the underlying chain's transactional unit cost. Each instantiation of a Sidetree-based DID Method may select a different maximum batch size; the size for the default configuration is TBD. 

#### Proof of Fee

   Each Sidetree transaction on the target chain is required to include a deterministic fee, based on the number of DID operations they seek to include via the on-chain transaction.

#### One Operation per DID per Batch
  Only one operation per DID per batch is allowed, this prevents the operation chain of any DID from growing at an intractable rate.

#### Commitment and Reveal for Operations
  Upon DID creation, the create operation payload must include:
  1. The hash of a _commitment_ value for the next recover operation.
  1. The hash of a _commitment_ value for the next update operation.
  https://en.wikipedia.org/wiki/Commitment_scheme

  The DID owner must reproduce and reveal the correct commitment value in the subsequent operation for the operation to be considered valid. In addition, each subsequent operation must also include the hash of the new commitment value(s) for the next operation. This scheme enables efficient dismissal of counterfeit operations without needing to evaluate signatures.

## Sidetree Client Guidelines
A Sidetree client manages the private keys and performs document operations on behalf of the DID owner. The Sidetree client needs to comply to the following guidelines to keep the DIDs it manages secure.

1. The client MUST keep the operation payload once it is submitted to a Sidetree node until it is generally available and observed. If the submitted operation is not observed, the same operation payload MUST be resubmitted. Submitting a different operation payload would put the DID in risk of a _late publish_ attack which can lead to an unrecoverable DID if the original operation payload contains a recovery key rotation and the recovery key is lost.



## Merkle Root Hash Inclusion (Currently not implemented, may support in the future)
Sidetree _anchor file_ also includes the root hash of a Merkle tree constructed using the hashes of batched operations.

The Sidetree specification does *not* rely on the root hash to operate and the usefulness of the Merkle root is still being discussed, but since this hash is small, stored off-chain, and cheap to compute and store, we do. There is an opportunity for an API or service to return a concise receipt (proof) for a given operation such that this operation can be cryptographically proven to be part of a batch without the need of the entire chunk file. Note this receipt cannot be provided in the response of the operation request because Merkle tree construction happens asynchronously when the final batch is formed.

Specifically, Sidetree uses an unbalanced Merkle tree construction to handle the (most common) case where the number of operations in a batch is not mathematically a power of 2: a series of uniquely sized balanced Merkle trees is formed where operations with lower index in the list of operations form larger trees; then the smallest balanced subtree is merged with the next-sized balanced subtree recursively to form the final Merkle tree.

### Sidetree Operation Batching Examples
The following illustrates the construction of the Merkle tree with an array of 6 operations:
* The smallest balance subtree I of 2 leaves [4, 5] is merged with the adjacent balanced tree J of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, H, I], and receipt for [5] will be [E, J].

```
                          ROOT=H(J+I)
                          /          \
                        /              \
                J=H(G+H)                 \
              /        \                   \
            /            \                   \
      G=H(A+B)             H=H(C+D)          I=H(E+F)
      /      \             /     \           /      \
    /        \           /        \         /        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])
    |         |         |         |         |         |
    |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5   ]

Where: [1] -> Denotes the binary buffer of the 1st element in the array of operation data.
        |  -> Denotes the logical relationship between an operation data and its hash.
       H() -> Denotes a hash function that returns a binary buffer representing the hash.
       A+B -> Denotes the concatenation of two binary buffers A and B.
```

The following illustrates the construction of the Merkle tree with an array of 7 operations:
* The smallest balanced subtree G of 1 leaf [6] is merged with the adjacent balanced subtree J of 2 leaves [4, 5] to form parent L, which in turn is merged with the adjacent balanced subtree K of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, I, L]; receipt for [4] will be [F, G, K]; receipt for [6] will be [J, K].
```
                             ROOT=H(K+L)
                          /               \
                        /                  \
                K=H(H+I)                    L=H(J+G)
              /        \                     /       \
            /            \                  /          \
      H=H(A+B)             I=H(C+D)        J=H(E+F)      \
      /      \             /     \         /      \        \
     /        \           /       \       /         \        \
  A=H([0])  B=H([1])  C=H([2])  D=H([3])  E=H([4])  F=H([5])  G=H([6])
    |         |         |         |         |         |         |
    |         |         |         |         |         |         |
[   0    ,    1    ,    2    ,    3    ,    4    ,    5    ,    6   ]
```

### Operation Receipts

While currently unused, Sidetree proposes the following JSON schema to represent a receipt:

```json
{
  "receipt": [
    {
      "hash": "A Merkle tree node hash.",
      "side": "Must be 'left' or 'right', denotes the position of this hash."
    },
    ...
  ]
}
```

Where the first entry in ```receipt``` is the sibling of the operation hash in the Merkle tree; followed by the uncle, then the great uncle and so on.

> NOTE: This scheme does __not__ include the root hash as the last entry of the receipt.

> NOTE: Receipt array will be empty thus is optional if no batching occurs (i.e. a tree of one operation).


## FAQs
* Why introduce the concept of an _anchor file_? Why not just anchor the _chunk file hash_ directly on blockchain?

  It would be ideal to be able to fetch metadata about the batched operations efficiently,
  without needing to download the entire chunk file.
  This design is needed for the implementation of "light nodes", it also opens up possibilities of other applications of the Sidetree specification.

* Why assign a _transaction number_ to invalid transactions?

  In the case of an _unresolvable transaction_, it is unknown if the transaction will be valid or not if it becomes resolvable, thus it is assigned a transaction number such that if the transaction turns out to be valid, the transaction number of valid transactions that occur at a later time remain immutable. This also enables all Sidetree nodes to refer to the same transaction using the same transaction number.
