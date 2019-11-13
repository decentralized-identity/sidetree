import { SidetreeError } from '../lib/core/Error';

/**
 * Encapsulates the helper functions for the tests.
 */
export default class JasmineSidetreeErrorValidator {

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedSidetreeError The expected error.
   */
  public static expectSidetreeErrorToBeThrown (functionToExcute: () => any, expectedSidetreeError: SidetreeError): void {
    let validated: boolean = false;

    try {
      functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedSidetreeError.code);
        validated = true;
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
  public static async expectSidetreeErrorToBeThrownAsync (functionToExcute: () => Promise<any>, expectedSidetreeError: SidetreeError): Promise<void> {
    let validated: boolean = false;

    try {
      await functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedSidetreeError.code);
        validated = true;
      }
    }

    if (!validated) {
      fail();
    }
  }
}
