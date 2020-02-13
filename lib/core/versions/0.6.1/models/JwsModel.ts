/**
 * Defines data structure for a flattened JSON JWS.
 */
export default interface JwsModel {
  protected: string;
  payload: string;
  signature: string;
}
