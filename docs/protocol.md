**Sidetree Protocol Specification**
===================================

Using blockchains for anchoring and tracking unique, non-transferable, digital entities is a useful primitive, but the current strategies for doing so suffer from severely limited transactional performance constraints. Sidetree is a layer-2 protocol for anchoring and tracking _decentralized identities (DIDs)_ across a blockchain. The central design idea involves _batching_ multiple Sidetree DID operations into a single transaction over the blockchain. This allows Sidetree to inherit the immutability and verifiability guarantees of blockchain without being limited by its transaction rate.

# Overview

This document provides the protocol specification of the Sidetree *DID method*. A comprehensive introduction to DIDs is beyond the scope of this document; the specification of DIDs can be found [here](https://w3c-ccg.github.io/did-spec/) and a more accessible primer [here](https://github.com/WebOfTrustInfo/rebooting-the-web-of-trust-fall2017/blob/master/topics-and-advance-readings/did-primer.md). Briefly, a DID infrastructure is a mechanism for creating unique identifiers and managing metadata (called *DID Documents*) with these identifiers without the need for a centralized authority. The DID specification delegates to *DID methods* (such as Sidetree), the details how DIDs are created and how the associated DID documents are managed.

![Sidetree System Overview](./diagrams/overview-diagram.png)

Architecturally, a Sidetree network is an _overlay_ network over a blockchain with one or more _Sidetree nodes_ as illustrated by the above figure. Each Sidetree node provides service endpoints to perform DID CRUD (Create, Resolve, Update, and Delete) operations. A Sidetree node embeds (anchors) information about the operations that it processes in the underlying blockchain. The blockchain consensus mechanism helps serialize Sidetree operations processed by different nodes and provide a consistent view of the state of all DIDs to all Sidetree nodes, without requiring its own consensus layer. The Sidetree protocol embeds only a concise cryptographic hash of the operations in the blockchain. The details of the operations are stored in a _distributed content-addressable storage (DCAS or CAS)_. Both the Sidetree's full Merkle Tree and source data for its leaves are stored in IPFS that anyone can run to provide redundancy of Sidetree Entity source data. Different Sidetree nodes therefore communicate with one another through the blockchain and IPFS.

> TODO: Merkle tree is mentioned all of a sudden in the overview, but yet no mentioning of critical "batching" concept.

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


# Sidetree Entity Operations

Sidetree Entities are a form of [Decentralized Identifier](https://w3c-ccg.github.io/did-spec/) (DID) that manifest through blockchain-anchoring DID Document objects (and subsequent deltas) that represent the existence and state of entities. A Sidetree compute node exposes a REST API using which an external application can create a new DID with an initial DID Document, update the DID Document, lookup (resolve ) the DID Document for a DID, and delete the Document.

## DID Documents

A DID Document contains information (metadata) about a DID that includes the public key of the DID owner and other attributes and claims. As per the [DID specification](https://w3c-ccg.github.io/did-spec/), a DID document is a JSON object with format specified in [JSON-LD](https://www.w3.org/TR/json-ld/). An update to a DID document is specified as a [JSON patch](https://tools.ietf.org/html/rfc6902) and is authenticated with a signature using the DID owner's private key. The sequence of updates to a DID document produces a sequence of _versions_ of the document. Each update to an entity references the previous update (creation, update, recovery, etc.) forming a chain of change history. Ownership of an Entity is linked to possession of keys specified within the Entity object itself.

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

# Sidetree Compute Node

This section focuses on the implementation details of a Sidetree compute node (SCN). We structure the SCN’s implementation with three modular components (with their high-level functionality discussed below: (1) Rooter, (2) Cache-builder, and (3) Resolver. Together they implement the Sidetree Entity protocol with the APIs discussed in the prior section.

## Rooter

A rooter is a process run by a SCN that handles Create, Update, and Delete operations and anchors them on a blockchain. The pseudo code below assumes that it can interface with IPFS (via put operation) and a blockchain (via post operation). The pseudocode currently doesn’t track responses to CUD operations. We need to specify a global state of a SCN and then have each component manipulate that state.

``` javascript
while(true){
	batch = new Batch();
	do{
		op <- recv_sidetree_op() // op is a Create, Update, or Delete operation
		batch.add(txn);
	} while (batch.size() < BATCH_SIZE);

	HashVector hashedTxns = new HashVector();
	foreach transaction t in batch {
		Hash h < -hash(t); // compute a SHA-256 hash of the input
		ipfs.put(h, t); // store transactions in IPFS under their cryptographic hash
		hashedTxns.append(h);
	}

	Hash opHash = hash(hashedTxns);
	ipfs.put(opHash, hashedTxns); // store the array of hashes
	MerkleTree m <- constructMerkleTree(hashedTxns);
	Hash merkleHash = m.root;
	BlockchainTxn btxn = createBlockchainTxn(merkleHash, opHash);
	blockchain.post(btxn);
}
```

## Cache-Builder

A Cache-Builder watches the public blockchain to identify Sidetree operations, verifying their authenticity, and building a local cache to help an SCN service perform Resolve operations quickly.

### Walking the Chain

**1**. Secure a copy of the target blockchain and listen for incoming transactions

**2**. Starting at the genesis entry of the blockchain, begin processing the included transactions in order, from earliest to latest.

### Inspecting a Transaction

**3**. For each transaction, inspect the property known to bear the marking of a Sidetree Entity. If the transaction is marked as a Sidetree Entity, continue, if unmarked, move to the next transaction.

**4**. Locate the Merkle Root and hash of the compressed Merkle Leaf file within the transaction.

### Processing the Sidetree

**5**. Fetch the compressed Merkle Leaf source data from the decentralized storage system.

**6**. When the compressed Merkle Leaf source data is inflated to a state that allows for evaluation, begin processing the leaves in index order.

### Evaluating a Leaf

*__If the leaf's Entity object contains just one operation:__*

**7**. The object shall be treated as a new Entity registration.

**8**. Ensure that the entry is signed with the owner's specified key material. If valid, proceed, if invalid, discard the leaf and proceed to the next.

**9**. Generate a state object using the procedural rules in the "Processing Entity Operations" section below, and store the resulting state in cache.

*__If the Entity contains multiple operations:__*

**7**. Retrieve the last Entity state from cache.

**8**. Evaluate the incoming Entity entry to determine if it is a fork, and if the fork supersedes the previously recognized Entity state:

  1) Begin comparing hashes of current Entity state operations against the incoming Entity update's operations at index 0.
  2) If during iteration and comparison of operation hash equality an operation index is found to be divergent from the current Entity state, the incoming Entity represents a fork. Halt iteration and proceed to handle the incoming update as a fork.
  3) The forking operation is valid if it:
      - Includes a valid `proof` that establishes linkage to the last known good operation's Merkle Root.
      - Is signed by keys that were known-valid in the operation index preceding the fork index __OR__ the incoming fork operation contains a valid `recovery` of the Entity. (to assess an operation for recovery, see the section "Evaluating Recovery Attempts")
  4) If the fork is invalid, discard the leaf and proceed to the next. 

**9**. Attempt to update the Entity's state (see "Processing Entity Updates" for rules):

- If the incoming Entity entry is a valid, superseding fork:

    attempt to update the cached Entity's state from the index of the fork's occurrence. If all fork operations are valid and processed without error or violation of protocol rules, save the resulting Entity state to cache, if the fork evaluation fails, discard the leaf and proceed to the next. 

- If the incoming Entity entry is a non-conflicting update:

    Attempt to update the current Entity state from the the first new operation of the incoming Entity entry. If all new update operations are valid and processed without error or violation of protocol rules, save the resulting Entity state to cache, if the fork evaluation fails, discard the leaf and proceed to the next.

### Processing Entity Operations

In order to update an Entity's state with that of an incoming Entity entry, various values and objects must be examined or assembled to validate and merge incoming operations. The following the a series of steps to perform to correctly process, merge, and cache the state of an Entity:

#### If processing from 0 index (the initial Entity registration operation) of the Entity object:

**1**. Create and hold an object in memory that will be retained to store the current state of the Entity.

**2**. Store the [DID Version URL](#dids-and-document-version-urls) in the cache object.

**3**. Use the `delta` value of the Entity to create the initial state of the DID Document via the procedure described in [RFC 6902](http://tools.ietf.org/html/rfc6902). Store the compiled DID Document in the cache object. If the delta is not present, abort the process and discard as an invalid DID.

**4**. Verify that the `sig` value is a signature from one of the keys in the compiled DID Document.

**5**. If the `recovery` field is present in the Entity, store any recovery descriptor objects it contains as an array in the cache object.

**6**. Store the source of the Entity in the cache object.

#### If processing any operation beyond index 0:

**1**. Validate that the object's proof field is present, and its value is a proof that links to the last operation's transaction root.

**2**. If the field `recover` is present on the Entity, the operation is initiating a recovery of the Entity. Process the value of the `recover` field in accordance with the recovery process defined by the matching `recovery` descriptor. If the recovery attempt is validated against the matching recovery descriptor, proceed. If there is no matching descriptor, or the recovery attempt is found to be invalid, abort, discard the entry, and revert state to last known good.

**3**. If no recovery was attempted, validate the Entity operation `sig` with one of the keys present in the DID Document compiled from the Entity's current state. If a recovery was performed, skip this step and proceed.

**4**. Use the `delta` present to update the compiled DID Document object being held in cache.

**5**. If the `recovery` field is present in the Entity, store any recovery descriptor objects it contains as an array in the cache object.

**6**. Store the source of the new Entity source in the cache object.

### Implementation Pseudo Code

```javascript
function getRootHash(txn){
  // Inspect txn, and if it is a Sidetree-bearing Entity, process the tree 
}
async function getLeafFileHash(txn) {
  // Fetch tree source data from decentralized storage, return array of leaves.
  // If not found warn: "Processing Warning: tree not found"
};
async function getLeafData(leafFileHash) {
  // Fetch and return Entity source data from decentralized storage.
  // If not found warn: "Processing Warning: Entity not found"
};
async function getEntityState(id){ ... };
async function validateOpSig(op) { ... };
async function validateOpProof(entity) { ... };
async function validateFork(state, update, forkIndex) { ... }
async function updateState(state, update, startIndex) { ... }
function mergeDiff(doc, diff) { ... };
function generateOpHash(op){ ... }


function processTransaction(txn){
  var rootHash = getRootHash(txn);
  var leafFileHash = getLeafFileHash(txn);
  if (rootHash && leafFileHash) {
    var leaves = await getLeafData(leafFileHash);
    if (leaves) {
      for (let leafHash in leaves) {
        processLeaf(leaves[leafHash], leafHash, rootHash);
      }
    }
  }
}

function processLeaf(entity, leafHash, rootHash) {
  if (!entity || !Array.isArray(entity) || !entity.length) {
    throw new Error('Protocol Violation: entity is malformed');
  }
  if (entity.length === 1) {
    return await processGenesisOp(entity, leafHash, rootHash);
  }
  else {
    return await processUpdate(entity, leafHash, rootHash);
  }
}

async function processGenesisOp(entity, leafHash, rootHash){
  var id = rootHash + '-' + leafHash;
  var state = await getEntityState(id);
  if (state === null) {
    var genesis = entity[0];
    if (!validateOpSig(genesis)) {
      throw new Error('Protocol Violation: operation signature is invalid');
    }
    return await setEntityState(id, {
      id: id,
      src: entity,
      doc: mergeDiff({}, genesis.delta),      
      recovery: genesis.recovery || []
    });
  }
}

async function processUpdate(entity, leafHash, rootHash){
  if (!validateOpProof(update)) return false;
  var id = update[1].proof.id;
  var state = await getEntityState(id);
  var forkIndex;
  var forked = state.src.some((op, i) => {
    if (op.proof.leafHash !== generateOpHash(update[i])) {
      forkIndex = i;
      return true;
    }
  });
  if (forked){
    if (await validateFork(state, update)) {
      return await updateState(state, update, forkIndex);
    }
  }
  else if (update.length > state.src.length) {
    return await updateState(state, update, update.length);
  }
  else throw new Error('Protocol Violation: update discarded, duplicate detected');
}
```
## Resolver

A resolver uses the cache built by Cache-Builder to service Resolve and Prove (as well as non-CRUD operations). For now, we focus on specifying how we implement Resolve operation. Resolve(did) is simply Cache.get(did).

# IPFS Interfacing

IPFS is a global peer-to-peer Merkle DAG _content addressable_ file system. The Sidetree Entity protocol discussed so far uses it as a black box to store Sidetree operations. Any stored information can be retrieved from the IPFS network using the hash of the content. IPFS running node exposes HTTP REST API ([https://ipfs.io/docs/api/](https://ipfs.io/docs/api/)) to interact with the underlying IPFS system.

Microsoft will have to run its own IPFS nodes to ensure sufficient replication of Sidetree blocks stored on IPFS. One potential solution is to use the pinning feature provided by IPFS, but how do ensure sufficient replication without requiring Sidetree compute nodes to interact with other nodes is an open question for investigation.

# Security and Functionality Guarantees

Assuming the underlying blockchain can be trusted, an implementation provides a guarantee that all _honest_ Sidetree nodes that have a consistent "view'' of the world, independent of any malicious nodes in the network. More formally, if the following assumptions hold:

1. The public blockchain used by Sidetree compute nodes is fork-free.

2. Cache-Builder is deterministic in terms of computing a cache given an ordered sequence of Sidetree transactions.

We claim that every pair of _honest_ Sidetree compute nodes (i.e., those that follow their prescribed protocol) compute caches that are _consistent_ with each other—regardless of actions of any number of malicious Sidetree compute nodes. By a consistent cache, we mean honest Sidetree nodes know about the same set of DIDs and associate the same DID document and version history for each DID, implying that the output of any *Resolve(did)* operation would be the same when processed by any honest node.

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