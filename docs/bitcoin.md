# Bitcoin Blockchain Service Reference Implementation


## Value Time Lock

### Protocol parameters

| Protocol parameters                  | Description                                              |
| ------------------------------------ | ---------------------------------------------------------|
| valueTimeLockDurationInBlocks        | The duration which a value time lock is required to have |

### Configuration parameters
* valueTimeLockUpdateEnabled

This parameter controls whether the value time lock is actively being renewed and if the funds will be returned to wallet in case of `valueTimeLockAmountInBitcoins` being set to zero. When this parameter is set to `false`, parameters `valueTimeLockAmountInBitcoins`, `valueTimeLockPollPeriodInSeconds` and `valueTimeLockTransactionFeesAmountInBitcoins` will be ignored.

* valueTimeLockAmountInBitcoins

The desired fund locked to write larger operation batches. Set to 0 will causes existing locked fund (if exists) to be released back to wallet upon lock expiry.

* valueTimeLockPollPeriodInSeconds

The polling duration between checks to see if the value time lock needs to be re-locked or released back to wallet.

* valueTimeLockTransactionFeesAmountInBitcoins

The fund allocated for transaction fees for subsequent re-locking of the initial value time lock.

> Developer's note:
This allotted amount is locked together with value time lock for simplicity of re-lock implementation. If this allotted amount is depleted due to subsequent re-locks, the remaining locked amount will be released back to wallet, and a new lock will be created with this allotted amount added to it again.

## Events

### `bitcoin_processor_databases_revert`
Occurs every time the databases are reverted due to a bitcoin reorg.

Event data:
```json
{
  "blockHeight": "The block height that the databases are reverted to.",
}
```

### `bitcoin_processor_observing_loop_failed`
Occurs every time the bitcoin processor fails an observing loop.

Event data: none

### `bitcoin_processor_observing_loop_success`
Occurs every time the bitcoin processor successfully completes a processing loop.

Event data:
```json
{
  "batchSize": "The size of the batch written.",
}
```
