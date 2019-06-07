/**
 * Standardized error class for throwing generic errors internal to this project.
 * NOTE: Not to be confused with RequestError which is used as a response to external requests.
 */
export class SidetreeError extends Error {
  constructor (public code: ErrorCode, message?: string) {
    super(message ? message : code);

    // NOTE: Extending 'Error' breaks prototype chain since TypeScript 2.1.
    // The following line restores prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error codes intended for internal use such as debugging, telemetry, and reporting etc.
 * Every error thrown must use a unique code.
 * Error code convention unless generic: error_category.sub_error_code
 */
export enum ErrorCode {
  InvalidTransactionNumberOrTimeHash = 'invalid_transaction_number_or_time_hash'
}
