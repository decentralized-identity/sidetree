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
   
   By defining a maximum number of operations per batch, the strategy circumvents participants to anchor arbitrarily large trees on the system. At its core, this mitigation strategy forces the attacker to deal with the organic economic pressure exerted by the underlying anchoring system's transactional unit cost. Each instantiation of a Sidetree-based DID Method may select a different maximum batch size; the size for the default configuration is TBD. 

#### Proof of Fee

   Each Sidetree entry on the target anchoring system is required to include a deterministic fee, based on the number of DID operations they seek to include via the anchoring system entry.

#### One Operation per DID per Batch
  Only one operation per DID per batch is allowed, to prevent DIDs from accumulating an inordinate amount of state.

#### Commitment and Reveal for Operations
  Upon DID creation, the create operation payload must include:
  1. The hash of a _commitment_ value for the next recover operation.
  1. The hash of a _commitment_ value for the next update operation.
  https://en.wikipedia.org/wiki/Commitment_scheme

  The DID owner must reproduce and reveal the correct commitment value in the subsequent operation for the operation to be considered valid. In addition, each subsequent operation must also include the hash of the new commitment value(s) for the next operation. This scheme enables efficient dismissal of counterfeit operations without needing to evaluate signatures.

## Sidetree Client Guidelines
A Sidetree client manages the private keys and performs document operations on behalf of the DID owner. The Sidetree client needs to comply to the following guidelines to keep the DIDs it manages secure.

1. The client MUST keep the operation payload once it is submitted to a Sidetree node until it is generally available and observed. If the submitted operation is not observed, the same operation payload MUST be resubmitted. Submitting a different operation payload would put the DID in risk of a _late publish_ attack which can lead to an unrecoverable DID if the original operation payload contains a recovery key rotation and the recovery key is lost.


## FAQs
* Why are we not checking signatures at observation time for all updates, recoveries, and deactivates?

  Because signature checks are computationally expensive, so we defer such compute until resolution time.

* Why have the concept of _index files_?

  It would be useful to be able to fetch metadata about the batched operations without needing to download the actual batched operations.
  This design is needed for the implementation of "light nodes".

* Why assign a _transaction number_ to invalid transactions?

  This allows all Sidetree nodes to refer to the same transaction using the same transaction number regardless of its validity.
