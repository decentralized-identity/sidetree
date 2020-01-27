/**
 * Defines operation request data structure for basic type safety checks.
 */
export default interface IOperation {
  header: {
    operation: string;
    kid: string;
  };
  payload: string;
  signature: string;
}
