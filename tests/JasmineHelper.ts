import { SidetreeError } from '../lib/core/Error';

/**
 * Encapsulates the helper functions for the tests.
 */
export default class JasmineHelper {

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedSidetreeError The expected error.
   */
  public static expectSideTreeErrorToBeThrown (functionToExcute: () => any, expectedSidetreeError: SidetreeError): void {
    let validated: boolean = false;

    try {
      functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        validated = (e.code === expectedSidetreeError.code);
      }
    }

    if (!validated) {
      fail();
    }
  }

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedSidetreeError The expected error.
   */
  public static async expectSideTreeErrorToBeThrownAsync (functionToExcute: () => Promise<any>, expectedSidetreeError: SidetreeError): Promise<void> {
    let validated: boolean = false;

    try {
      await functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        validated = (e.code === expectedSidetreeError.code);
      }
    }

    if (!validated) {
      fail();
    }
  }
}
