/**
 * Defines functionality for a class which handles the reading/writing data for the bitcoin ledger layer.
 */
export default interface IBitcoinLedger {

  /**
   * Makes a generic RPC call to the satoshi client and returns the response.
   *
   * @param request The request to send to the satoshi client.
   * @param timeout if true then timeout the call; otherwise do not timeout.
   */
  SendGenericRequest (request: any, timeout: boolean): Promise<any>;
}
