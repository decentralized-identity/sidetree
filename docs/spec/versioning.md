## Protocol Versioning

The rules and parameters of the Sidetree protocol MAY change in the future, resulting in new versions of the specification. The Sidetree specification and reference implementation follow [SemVer 2.0](https://semver.org/).

Versions of the specification can be found on the Decentralized Identity Foundation's website at the following version-based paths:

```html
https://identity.foundation/sidetree/docs/v<major>.<minor>.<patch>/
```

Versions of the Sidetree reference implementation are provided as npm modules and [GitHub releases](https://github.com/decentralized-identity/sidetree/releases):


```json
{
  "name": "@decentralized-identity/sidetree",
  "version": "<major>.<minor>.<patch>",
  ...
```

### Version Segment Definitions

- **Major:** Major protocol evolution, with breaking protocol advancements so large they warrant incrementing the major version.
- **Minor:** Critical updates, protocol forking changes, or security patches that require all nodes to upgrade.
- **Patch:** Non-critical changes that do not require nodes to upgrade.

### New Version Activation

New versions of the protocol, or modifications to parameter values by implementers, ****MUST**** be activated at a specified [_Ledger Time_](#ledger-time) so all nodes can remain in sync by enforcing the same ruleset and parameters beginning at the same logical starting point. All transactions that occur after the specified [_Ledger Time_](#ledger-time) will adhere to the associated version's rules and parameters until a newer version of the protocol is defined and implemented at a future [_Ledger Time_](#ledger-time).