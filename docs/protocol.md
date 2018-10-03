**Sidetree Protocol Specification**
===================================

This document describes the Sidetree protocol, a specification of the a _DID method_ described in the [_DID specification_](https://w3c-ccg.github.io/did-spec/). Briefly, a _DID method_ is a mechanism for creating unique identifiers and managing metadata (called *DID Documents*) associated with these identifiers without the need for a centralized authority.

# Overview

Using blockchains for anchoring and tracking unique, non-transferable, digital entities is a useful primitive, but the current strategies for doing so suffer from severely limited transactional performance constraints. Sidetree is a layer-2 protocol for anchoring and tracking _[DID documents](https://w3c-ccg.github.io/did-spec/)_ across a blockchain. The central design idea involves batching multiple _DID document_ operations into a single blockchain transaction. This allows Sidetree to inherit the immutability and verifiability guarantees of blockchain without being limited by its transaction rate.

![Sidetree System Overview](./diagrams/overview-diagram.png)

Architecturally, a Sidetree network is a network consists of multiple logical servers (_Sidetree nodes_) executing Sidetree protocol rules, overlaying a blockchain network as illustrated by the above figure. Each _Sidetree node_ provides service endpoints to perform _operations_ (e.g. Create, Resolve, Update, and Delete) against _DID documents_. The blockchain consensus mechanism helps serialize Sidetree operations published by different nodes and provide a consistent view of the state of all _DID Documents_ to all Sidetree nodes, without requiring its own consensus layer. The Sidetree protocol batches multiple operations using an unbalanced Merkle tree and embeds the hash of a file (_anchor file_) containing the Merkle root hash in the blockchain. The actual data of all batched operations are stored as one single file (_batch file_) in a _distributed content-addressable storage (DCAS or CAS)_. Anyone can run a CAS node without running a Sidetree node to provide redundancy of Sidetree _batch files_.

## Terminology

| Term          | Description                                                           |
|---------------|-----------------------------------------------------------------------|
| Anchor file   | The file containing metadata of a batch of Sidetree operations, of which the hash is written to the blockchain as a Sidetree transaction. |
| Batch file    | The file containing all the operation data batched together.          |
| CAS           | Same as DCAS.                                                         |
| DCAS          | Distributed content-addressable storage.                              |
| DID document  | A document as described by the [DID specification](https://w3c-ccg.github.io/did-spec/), containing information about a DID such as the public key of the DID owner and service endpoints used.
| Operation     | A change to a DID document.                                           |
| Sidetree node | A logical server executing Sidetree protocol rules                    |
| Transaction   | A blockchain transaction representing a batch of Sidetree operations. |

# Sidetree Operation Batching
Sidetree anchors the root hash of a Merkle tree that cryptographically represents a batch of Sidetree operations on the blockchain. Specifically, Sidetree uses an unbalanced Merkle tree construction to handle the (most common) case where the number of operations in a batch is not mathematically a power of 2; in which case a series of uniquely sized balanced Merkle trees is formed where operations with lower index in the list of operations form larger trees, then the smallest balanced subtree is merged with the next-sized balanced subtree recursively to form the final Merkle tree.

## Sidetree Operation Receipts
Since Sidetree batches many operations using a Merkle tree, each operation can be given a concise receipt such that it can be cryptographically proven to be part of the batch. Sidetree uses the following JSON schema to represent a receipt:

```json
{
  "receipt": [
    {
      "hash": "The base64url encoded value of a Merkle tree node hash.",
      "side": "Must be 'left' or 'right', denotes the position of this hash."
    },
    ...
  ]
}
```

Where the first entry in ```receipt``` is the sibling of the operation hash in the Merkle tree; followed by the uncle, then the great uncle and so on.

> NOTE: This scheme does __not__ include the root hash as the last entry of the receipt.

> NOTE: Receipt array will be empty thus is optional if no batching occurs (i.e. a tree of one operation).

## Sidetree Operation Batching Examples
The following illustrates the construction of the Merkle tree with an array of 6 operations:
* The smallest balance subtree I of 2 leaves [4, 5] is merged with the adjacent balanced tree J of 4 leaves [0, 1, 2, 3] to form the final Merkle tree.
* Receipt for [0] will be [B, H], and receipt for [5] will be [E, J].

```
                          ROOT=H(K+J)
                          /          \
                        /              \
                J=H(H+I)                 \
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

## Sidetree CAS-layer Files
For every batch of Sidetree operations created, there are two files that are created and stored in the CAS layer: 
1. Batch file - The file containing the actual change data of all the operations batched together.
2. Anchor file - The hash of the _anchor file_ is written to the blockchain as a Sidetree transaction, hence the name _'anchor'_. This file contains the metadata of the batch of Sidetree operations, this includes the reference to the corresponding _batch file_.

### Batch File Schema
The _batch file_ is a ZIP compressed JSON document of the following schema:
```json
{
  "operations": [
    "Base64URL encoded operation",
    "Base64URL encoded operation",
    ...
  ]
}
```

### Anchor File Schema
The _anchor file_ is a JSON document of the following schema:
```json
{
  "batchFile": "The Base64URL encoded SHA256 hash of the batch file."
  "merkleRoot": "The Base64URL encoded root hash of the Merkle tree contructed using the batch file."
}
```

# Sidetree Entity Operations

Sidetree Entities are a form of [Decentralized Identifier](https://w3c-ccg.github.io/did-spec/) (DID) that manifest through blockchain-anchoring DID Document objects (and subsequent deltas) that represent the existence and state of entities. A _Sidetree node exposes a REST API using which an external application can create a new DID with an initial DID Document, update the DID Document, lookup (resolve ) the DID Document for a DID, and delete the Document.

## DID Documents

> TODO: to be updated.

 An update to a DID document is specified as a [JSON patch](https://tools.ietf.org/html/rfc6902) and is authenticated with a signature using the DID owner's private key. The sequence of updates to a DID document produces a sequence of _versions_ of the document. Each update to an entity references the previous update (creation, update, recovery, etc.) forming a chain of change history. Ownership of an Entity is linked to possession of keys specified within the Entity object itself.

System diagram showing op sig links that form a Sidetree Entity Trail:
> TODO: Need to update this outdated diagram: 1. each operation only references the previous. 2. Only file hash is anchored on blockchain.

![Sidetree Entity Trail diagram](./diagrams/sidetree-entity-trail.png)


## DIDs and Document Version URLs

All state-modifying Sidetree operations (Create, Update, and Delete), upon successful completion, return as output a _version URL_ that serves as a unique handle identifying the version of the DID document produced by the operation; the handle is used as input parameters of future operations as discussed below. A version URL is of the form **did:stree:SHA256Hash** where *SHA256Hash* represents a hex encoded SHA256 hash value. The version URL is an emergent value derived from anchoring the update operation in the blockchain as described in [Section](#creation-of-a-sidetree-entity).

The version URL output by the Create operation defines the newly created decentralized id (DID). In other words, a DID is simply the URL of the first version of its document.

A subtlety relating to version URLs and (DIDs in the original proposal) is that they are not _physically_ unique: There could be multiple updates anchored in the blockchain with the same URL. However, this does not affect correctness since the Sidetree protocol ensures that only the first anchored update in the blockchain is valid and invalidates the rest.

## Creation of a Sidetree Entity

The input-output signature of the Create operation is the following:

*Create ({InitPatch, RecoveryPatch}, Signature) -> DID URL*

where,

 - InitPatch: A JSON-encoded array that includes one member: an object
   with a `delta` property that describes the initial state of a DID
   Document, in the delta format specified by [RFC
   6902](http://tools.ietf.org/html/rfc6902).
 - RecoveryPatch: A JSON patch to produce the recovery public key.
 - Signature: A binary blob containing the signature of InitPatch and
   the signature of RecoveryPatch under the owner’s private key.

Hash the Sidetree Entity object and embed it in a Merkle Tree with other Sidetree Entity operations. Create a transaction on the blockchain with the Merkle root embedded within it and mark the transaction to indicate it contains a Sidetree. Store the source for the leaves of the Merkle Tree source in IPFS.

If the operation is successful, it returns a DID URL. In addition, the operation has the side-effect of associating with the DID, the JSON document generated as follows:

 - Generate the JSON document from InitPatch.
 - Embed the emergent DID in the document generated in previous step.

 The second step could be optional since the DID specification does not require the DID be embedded in the associated DID document

  > NOTE: 
  >  - Because every operation beyond initial creation contains pointers and
   delta state proofs that link previous operations together, only the
   latest revision of the object must be retained in the decentralized
   storage layer.

> - An important question is _when does_ the above call returns. A simple
   implementation waits until the operation data is committed to the
   blockchain. If Bitcoin is the underlying blockchain, this approach
   would imply a latency of at least one bitcoin block (around 10
   minutes), possibly more if want to minimize the probability of a
   block becoming invalid due to a longer chain elsewhere. Proof of
   Entity ownership plus a subset of uses should be possible (because
   regardless of block inclusion, the owner is verifiable via included
   key references), but the Entity remains in a pending state until it
   is confirmed in a block.
   > - The state-modifying operations have an input-output signature of the form:
Operation: ({Delta Patch and other params}, Signature} -> Version URL
Where the Signature covers some serialization of params within the parenthesis. This suggests having a single operation and moving the operation (Create, Update, Delete) inside the parenthesis as one of the params, but for this writeup we will keep the operations as distinct for clarity.

## Updating a Sidetree Entity

The input-output signature of the update operation is the following:
  
*Update ({UpdatePatch, VersionURL}, Signature) -> VersionURL*
where,
- UpdatePatch: JSON patch specifying the update,  encoded in the format specified by [RFC 6902](http://tools.ietf.org/html/rfc6902)
- VersionURL: Version of the DID document to apply the patch.
- Signature: Signature with the owner key covering the above two parameters.

A proof property to the JSON patch object is also added with the value being the Merkle Proof that validates the last operation and its inclusion in the blockchain.

If the operation is successful, it applies the provided JSON patch to the version of the DID document identified by the input version URL and returns the version URL of the resulting DID Document. The operation fails if either of the following conditions hold:

1)  the version URL provided as input is not the latest version associated with the DID.
2)  The UpdatePatch attempts to change the recovery public key of the latest version associated with the DID.

The method signature does not explicitly specify the DID which is updated. But this is not required since the input VersionURL parameter unambiguously identifies the DID: each update identifies the previous version, and therefore indirectly the first version, which is the DID.
> NOTE:
> - Updates to a DID Document might be concurrently processed by different Sidetree nodes, but the Sidetree protocol serializes these updates using the underlying blockchain consensus mechanism. Such serialization might possibly invalidate some conflicting updates.
> - An alternative signature could be passing the DID itself instead of Version URL as a parameter, which explicitly identifies the DID but not the version, with the understanding that the patch will be applied to the latest version. This has two limitations:
> - It provides lesser control to an application than the proposed one. Consider the following scenario: an application sends an update to a Sidetree node; it times out and sends the same update to a different Sidetree node which applies the update; the first Sidetree node comes back alive and applies the update (again) on the updated document implying that the same update is applied twice. With the proposed signature, the system has information to decline the latter update.
It allows the system to prove to an external verifier about the existence of a version of a DID document that ultimately relies only on the owner signatures.

## Resolving a Sidetree Entity

The input-output signature of a Resolve operation is *Resolve(DID)->DIDDoc*. The call takes a DID as input and returns the latest version of the associated document as output. Specific error codes distinguish the case where the DID was never created (invalid DID) from the case where the DID was created but subsequently deleted.

## Recover a Sidetree Entity

The signature of the Recover operation is the following:

*Recover ({RecoveryPatch, VersionURL}, Signature) -> VersionURL*
where,
-  RecoveryPatch: JSON patch specifying a new recovery public key. The patch can optionally identify old primary public key(s) and include new primary public key(s).
-  VersionURL: Version of the DID document to apply the patch.
-  Signature: Signature with the recovery secret key (corresponding to the recovery public key stored in the latest version associated with the DID) covering RecoveryPatch and VersionURL.

If the operation is successful, it applies the provided JSON patch to the version of the DID document identified by the input version URL and returns the version URL of the resulting DID Document. The operation fails if the version URL provided does not exist or if the signature does not verify.

Note that, the method signature does not explicitly specify the DID which is recovered. But this is not required since the input VersionURL parameter unambiguously identifies the DID.

> NOTE:
> - The cryptographic mechanism here is to prove knowledge of the recovery secret key corresponding to the recovery public key associated with the latest version of the DID, without revealing the secret key. This is achieved by sending Signature on the RecoveryPatch. Note that the recovery patch must contain a fresh recovery public key. It is crucial to not release the recovery secret key, or to sign any predetermined message to prove its knowledge, a i.e., to have a non-replayable recovery mechanism. Otherwise, the system is exposed to man-in-the-middle vulnerability, where a malicious party can replace the new recovery public key in the recovery patch with her his own public key.
> - The recovery key of a DID can only be rotated through a recover op. If the primary secret key is lost or compromised, the owner can change it to a new pair through Recover op. If the owner loses the recovery key, but still has access to her primary key, she can invoke the Delete op to delete her DID. However, if the owner’s recovery key gets compromised, then she loses complete control of her DID.

## Proofing a Sidetree Node

The signature of the Prove operation is the following:

*Prove (VersionURL) -> ProofObject*

This call generates a proof object for a particular version of a DID document. The proof object contains the following information:

 1. The sequence of all signed (patch, previous version) pairs (the
    parameters of the update call) followed by the initial patch that
    provides the signed lineage of version of the DID document
    referenced by the input version URL. The signature is verifiable by
    the public key embedded in the initial patch.

2. The sequence of Merkle proofs and relevant bitcoin block (references) that establish that these patches are embedded in the blockchain.

One subtlety relating to the second component of the proof object is that a malicious Sidetree node can install an invalid operation in the underlying blockchain and generate a proof object for that operation. Other Sidetree nodes would reject the operation but the verifier cannot determine the invalidity without scanning the entire range of blocks referenced in the proof object.

## Version Navigation

They all have signatures *(VersionURL->VersionURL)*  and can be used to navigate the sequence of versions of a DID Document. Examples:

- First(verURL) returns the first URL, i.e., the DID of the document identified by verURL.
- Last(did) returns the version URL of the current (latest) version of the DID Document corresponding to did.


## Lookup

The lookup operation has the signature:

*Lookup (VersionURL) -> DIDDoc*

It returns the DID Document identified by a specific (possibly historical) version.  The implementation of Resolve(did) operation is then simply Lookup(Last(did)).


# IPFS Interfacing

IPFS is a global peer-to-peer Merkle DAG _content addressable_ file system. The Sidetree Entity protocol discussed so far uses it as a black box to store Sidetree operations. Any stored information can be retrieved from the IPFS network using the hash of the content. IPFS running node exposes HTTP REST API ([https://ipfs.io/docs/api/](https://ipfs.io/docs/api/)) to interact with the underlying IPFS system.

Microsoft will have to run its own IPFS nodes to ensure sufficient replication of Sidetree blocks stored on IPFS. One potential solution is to use the pinning feature provided by IPFS, but how do ensure sufficient replication without requiring Sidetree nodes to interact with other nodes is an open question for investigation.

# Security and Functionality Guarantees

Assuming the underlying blockchain can be trusted, an implementation provides a guarantee that all _honest_ Sidetree nodes that have a consistent "view'' of the world, independent of any malicious nodes in the network. More formally, if the following assumptions hold:

1. The public blockchain used by Sidetree nodes is fork-free.

2. Cache-Builder is deterministic in terms of computing a cache given an ordered sequence of Sidetree transactions.

We claim that every pair of _honest_ Sidetree nodes (i.e., those that follow their prescribed protocol) compute caches that are _consistent_ with each other—regardless of actions of any number of malicious Sidetree nodes. By a consistent cache, we mean honest Sidetree nodes know about the same set of DIDs and associate the same DID document and version history for each DID, implying that the output of any *Resolve(did)* operation would be the same when processed by any honest node.

There are a few subtleties with the above claim (as we discuss below): (a) blockchain tail stability (b) processing lag.

- Different nodes in the blockchain network might see different tail blocks in the blockchain ledger. (This would happen in bitcoin blockchain if more than one miner solves the PoW challenge concurrently.) If there are Sidetree transactions embedded in such tail blocks, different Sidetree nodes could end up with different states, but this difference is limited to updates in the affected transactions.
- A Sidetree node lagging behind others in terms of how many blockchain blocks it has processed will have a different DID state than the others.


# Open Questions

As an early WIP, this protocol may require further additions and modifications as it is developed and implemented. This is the list of topics, ideas, and discussions that have been considered, but not yet included in the proposed spec.

## DDoS Mitigation

Given the protocol was designed to enable unique Entity rooting and DPKI operations to be performed at 'unfair' volumes with unit costs that are 'unfairly' cheap, the single most credible issue for the system would be DDoS vectors.

What does DDoS mean in this context? Because Entity IDs and subsequent operations in the system are represented via embedded tree structures where the trees can be arbitrarily large, it is possible for protocol adherent nodes to create and broadcast transactions to the underlying blockchain that embed massive sidetrees composed of leaves that are not intended for any other purpose than to force other observing nodes to process their Entity operations in accordance with the protocol.

The critical questions are: can observing nodes 'outrun' bad actors who may seek to clog the system with transactions bearing spurious Sidetrees meant to degraded system-wide performance? Can an attacker generate spurious Sidetrees of Entity ops faster than observing nodes can fetch the Sidetree data and process the operations? Without actually running a simulation yet, it's important to consider what mitigations can be put in place to assure that, assuming an issue exists, it can be overcome.

At a certain point, the attacker would be required to overwhelm the underlying chain itself, which has its own in-built organic price-defense, but it's possible that the Layer 2 nodes can be overcome before that begins to impact the attacker.

## Mitigation ideas

#### Max Tree Depth

A very basic idea is to simply limit the depth of a protocol-adherent sidetree. The protocol could specify that Sidetrees that exceed a maximum depth are discarded, which would limit the ability of all participants to drop massive trees on the system. At its core, this mitigation strategy forces the attacker to deal with the organic economic pressure exerted by the underlying chain's transactional unit cost.

> NOTE: large block expansion of the underlying chain generally creates a Tragedy of the Commons spam condition on the chain itself, which negatively impacts this entire class of DDoS protection for all L2 systems. Large block expansion may exclude networks from being a viable substrate for Sidetree Entities, if this mitigation strategy was selected for use.

#### Transaction & Leaf-level Proof-of-Work

Another strategy could be enforcing a protocol requirement that hashes in each transaction and/or leaves be required to show a protocol-specified or algorithmically established proof-of-work for nodes to recognize the Sidetree as a valid submission.

By requiring these elements in a Sidetree transaction to have N level of leading 0s, it may be possible to degrade the ability of bad actors to effectively spam the system with useless Sidetrees that contain a massive numbers of ops. The user-level outcome would be that someone using the system to do an update of their human identity's DID would hash the update object with an included nonce on their local device until it satisfied the requisite work requirement, then have it included in a Sidetree. Nodes would discard any Sidetrees that do not meet the require work level.