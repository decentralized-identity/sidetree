## DID URI Composition

DID Methods based on the Sidetree protocol all share the same identifier format. The unique identifier segment of a Sidetree-based DID, known as the [DID Suffix](#did-suffix), is derived based on the initial state of the DID's state data. The [DID Suffix](#did-suffix) is cryptographically bound to the initial PKI state of the DID, which means Sidetree DIDs are _self-certifying_. As a result, a person or entity who creates a Sidetree-based DID knows their unique identifier at the moment of generation, and it is cryptographic secured for instant use (for more on the instant use capabilities of Sidetree DIDs, see [Unpublished DID Resolution](#unpublished-did-resolution)).

To generate the [_Short-Form DID URI_](#short-form-did){id="short-form-did"} of a Sidetree DID, use the [Hashing Process](#hashing-process) to generate a hash of the [canonicalized](#json-canonicalization-scheme) [_Create Operation Suffix Data Object_](#create-suffix-data-object). The following is an example of a resulting colon (`:`) separated DID URI composed of the URI scheme (`did:`), Method identifier (`sidetree:`), and unique identifier string (`EiBJz4...`):

Format of Short-form DID URI:

```html
did:METHOD:<did-suffix>
```

Example of Short-Form DID URI:

```javascript
did:sidetree:EiDahaOGH-liLLdDtTxEAdc8i-cfCz-WUcQdRJheMVNn3A
```

An implementer ****MAY**** define additional components in their method's DID URI composition.

::: note
Many implementations have multiple active network instances of their DID Method (e.g. mainnet and testnet). How different network instances of a DID Method are represented in the DID URI string is method-specific. Many methods choose to use the base format above (`did:METHOD`) as their primary/mainnet network, and add an additional segment after the `:METHOD` segment to denote other network instances, for example: `did:METHOD:testnet`. DID Methods ****SHOULD**** clearly describe parsing rules for distinguishing between their different network instances.
:::

### Long-Form DID URIs

In many DID Methods, there is a period of time (which may be indefinite) 
between the generation of a DID and the DID operation being anchored, 
propagated, and processed in the underlying anchoring and storage 
systems. In order to account for this, Sidetree introduces an equivalent 
variant of Sidetree-based DIDs that is _self-certifying_ and _self-resolving_, 
known as the [_Long-Form DID URI_](#long-form-did){id="long-form-did"}. 
The [_Long-Form DID URI_](#long-form-did) variant of Sidetree-based DIDs 
enables DIDs to be immediately resolvable after generation by including 
the DID's initial state data within the [_Long-Form DID URI_](#long-form-did) 
itself. Sidetree [_Long-Form DID URIs_](#long-form-did){id="long-form-did"} 
are the [_Short-Form DID URI_](#short-form-did) with an additional 
colon-separated (`:`) segment appended to the end. The value of this final 
URI segment is a canonicalized JSON data payload composed of the 
[_Create Operation Suffix_](#create-suffix-data-object) data and the 
[_Create Operation Delta_](#create-delta-object) data, encoded 
via the implementation's [`DATA_ENCODING_SCHEME`](#data-encoding-scheme).

Long-form DID JSON data payload:

```json
{
  "delta": {
    "patches": [
      {
        "action": "replace",
        "document": {
          "publicKeys": [
            {
              "id": "anySigningKeyId",
              "publicKeyJwk": {
                "crv": "secp256k1",
                "kty": "EC",
                "x": "H61vqAm_-TC3OrFSqPrEfSfg422NR8QHPqr0mLx64DM",
                "y": "s0WnWY87JriBjbyoY3FdUmifK7JJRLR65GtPthXeyuc"
              },
              "purposes": [
                "auth"
              ],
              "type": "EcdsaSecp256k1VerificationKey2019"
            }
          ],
          "services": [
            {
              "id": "anyServiceEndpointId",
              "type": "anyType",
              "serviceEndpoint": "http://any.endpoint"
            }
          ]
        }
      }
    ],
    "updateCommitment": "EiBMWE2JFaFipPdthcFiQek-SXTMi5IWIFXAN8hKFCyLJw"
  },
  "suffixData": {
    "deltaHash": "EiBP6gAOxx3YOL8PZPZG3medFgdqWSDayVX3u1W2f-IPEQ",
    "recoveryCommitment": "EiBg8oqvU0Zq_H5BoqmWf0IrhetQ91wXc5fDPpIjB9wW5w"
  }
}
```

Format of Long-Form DID URI:

```html
did:METHOD:<did-suffix>:<long-form-suffix-data>
```

Example of Long-Form DID URI:

```javascript
did:sidetree:EiDahaOGH-liLLdDtTxEAdc8i-cfCz-WUcQdRJheMVNn3A:eyJkZWx0YSI6eyJwYXRjaGVzIjpbeyJhY3Rpb24iOiJyZXBsYWNlIiwiZG9jdW1lbnQiOnsicHVibGljX2tleXMiOlt7ImlkIjoiYW55U2lnbmluZ0tleUlkIiwiandrIjp7ImNydiI6InNlY3AyNTZrMSIsImt0eSI6IkVDIiwieCI6Ikg2MXZxQW1fLVRDM09yRlNxUHJFZlNmZzQyMk5SOFFIUHFyMG1MeDY0RE0iLCJ5IjoiczBXbldZODdKcmlCamJ5b1kzRmRVbWlmSzdKSlJMUjY1R3RQdGhYZXl1YyJ9LCJwdXJwb3NlIjpbImF1dGgiXSwidHlwZSI6IkVjZHNhU2VjcDI1NmsxVmVyaWZpY2F0aW9uS2V5MjAxOSJ9XSwic2VydmljZV9lbmRwb2ludHMiOlt7ImVuZHBvaW50IjoiaHR0cDovL2FueS5lbmRwb2ludCIsImlkIjoiYW55U2VydmljZUVuZHBvaW50SWQiLCJ0eXBlIjoiYW55VHlwZSJ9XX19XSwidXBkYXRlX2NvbW1pdG1lbnQiOiJFaUJNV0UySkZhRmlwUGR0aGNGaVFlay1TWFRNaTVJV0lGWEFOOGhLRkN5TEp3In0sInN1ZmZpeF9kYXRhIjp7ImRlbHRhX2hhc2giOiJFaUJQNmdBT3h4M1lPTDhQWlBaRzNtZWRGZ2RxV1NEYXlWWDN1MVcyZi1JUEVRIiwicmVjb3ZlcnlfY29tbWl0bWVudCI6IkVpQmc4b3F2VTBacV9INUJvcW1XZjBJcmhldFE5MXdYYzVmRFBwSWpCOXdXNXcifX0
```

The [_Long-Form DID URI_](#long-form-did) variant of Sidetree-based DIDs supports the following features and usage patterns:

- Resolving the DID Documents of unpublished DIDs.
- Authenticating with unpublished DIDs.
- Signing and verifying credentials signed against unpublished DIDs.
- After publication and propagation are complete, authenticating with either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).
- After publication and propagation are complete, signing and verifying credentials signed against either the [_Short-Form DID URI_](#short-form-did) or [_Long-Form DID URI_](#long-form-did).