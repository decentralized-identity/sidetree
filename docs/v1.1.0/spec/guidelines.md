
## Method & Client Guidelines

The following are advisements and best practices for DID Method and Client (SDK, wallets, etc.) implementers that interact with Sidetree-based DID Methods. These guidelines should be carefully considered when implementing or interacting with a Sidetree-based DID Method.

### Sidetree Operations

A Sidetree client manages keys and performs document operations on behalf of a DID owner. The Sidetree client needs to comply to the following guidelines to securely, successfully manage a user's DIDs:

1. The client ****MUST**** keep the operation payload once it is submitted to a Sidetree node until it is generally available and observed. If the submitted operation is not anchored and propagated, for whatever reason, the same operation payload ****MUST**** be resubmitted. Submitting a different operation payload can put the DID at risk of late publish branching, which can lead to an unrecoverable DID if the original operation payload contains a recovery key rotation and that recovery key is lost. While this is a fringe possible issue, it's best to just retain these small operation payloads.

2. Another reason to retain operation payloads is to always have them available in the case you want to serve them across the backing Content Addressable Storage network. Most users won't elect to do this, but advanced wallets and users who seek maximum independence from any reliance on the persistence of their operations in the network may want to.

### Update vs Recovery Keys

It is advised that clients managing DIDs try as best as possible to separate the concepts of Update and Recovery keys. Compromise or loss of Update keys does not permanently imperil a user's control over their DID, where a loss or compromise of a Recovery key will, As such, it is important to create appropriate protections and processes for securing and using each type of key, commensurate with their level of control and risk.