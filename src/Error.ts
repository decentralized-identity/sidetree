/**
 * Standardized Error class for throwing errors in this project.
 */
export class SidetreeError extends Error {
  constructor (public errorCode: ErrorCode, message?: string) {
    super(message ? message : errorCode);

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
  DidNotFound = 'did_not_found',
  NoMatchingProtocolVersion = 'no_matching_protocol_version'
}
