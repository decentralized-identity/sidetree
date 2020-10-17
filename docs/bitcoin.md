# Bitcoin Blockchain Service Reference Implementation


## Value Time Lock

### Protocol parameters

| Protocol parameters                  | Description                              |
| ------------------------------------ | ---------------------------------------- |
| minimumValueTimeLockDurationInBlocks | TODO |
| maximumValueTimeLockDurationInBlocks | TODO |

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
