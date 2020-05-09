## Method Versioning

It is RECOMMENDED that Sidetree based DID Methods implement the following versioning structures to support development, testing, staging and production network deployments.

We define a network suffix as follows for a given DID Method:

`did:<method>:<network>:<didUniqueSuffix>`

If no network suffix is provided, it is assumed that the "mainnet" or "production" network is to be used... for example, these DIDs should resolve to the same DID Document:

```
did:elem:mainnet:EiD0x0JeWXQbVIpBpyeyF5FDdZN1U7enAfHnd13Qk_CYpQ
did:elem:EiD0x0JeWXQbVIpBpyeyF5FDdZN1U7enAfHnd13Qk_CYpQ
```

An ION DID on the Bitcoin Testnet3 testnet is defined as follows:

`did:ion:testnet3:EiD0x0JeWXQbVIpBpyeyF5FDdZN1U7enAfHnd13Qk_CYpQ`

An ELEM DID on the Ethereum Ropsten testnet is defined as follows:

`did:elem:ropsten:EiD0x0JeWXQbVIpBpyeyF5FDdZN1U7enAfHnd13Qk_CYpQ`

