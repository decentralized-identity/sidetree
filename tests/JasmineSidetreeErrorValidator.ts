import { SidetreeError } from '../lib/core/Error';

/**
 * Encapsulates the helper functions for the tests.
 */
export default class JasmineSidetreeErrorValidator {

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedSidetreeErrorCode The expected Sidetree error code.
   */
  public static expectSidetreeErrorToBeThrown (functionToExcute: () => any, expectedSidetreeErrorCode: string): void {
    let validated: boolean = false;

    try {
      functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedSidetreeErrorCode);
        validated = true;
      }
    }

    if (!validated) {
      fail(`Expected error '${expectedSidetreeErrorCode}' did not occur.`);
    }
  }

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedSidetreeErrorCode The expected Sidetree error code.
   */
  public static async expectSidetreeErrorToBeThrownAsync (functionToExcute: () => Promise<any>, expectedSidetreeErrorCode: string): Promise<void> {
    let validated: boolean = false;

    try {
      await functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedSidetreeErrorCode);
        validated = true;
      }
    }

    if (!validated) {
      fail(`Expected error '${expectedSidetreeErrorCode}' did not occur.`);
    }
  }
}
