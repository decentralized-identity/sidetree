/**
 * Event codes used by Bitcoin Processor.
 */
export default {
  BitcoinDatabasesRevert: 'bitcoin_processor_databases_revert',
  BitcoinLockMonitorLockReleased: `bitcoin_lock_monitor_lock_released`,
  BitcoinLockMonitorLockRenewed: `bitcoin_lock_monitor_lock_renewed`,
  BitcoinLockMonitorNewLock: `bitcoin_lock_monitor_new_lock`,
  BitcoinLockMonitorLoopFailure: `bitcoin_lock_monitor_loop_failure`,
  BitcoinLockMonitorLoopSuccess: `bitcoin_lock_monitor_loop_success`,
  BitcoinObservingLoopFailure: 'bitcoin_observing_loop_failure',
  BitcoinObservingLoopSuccess: `bitcoin_observing_loop_success`
};
