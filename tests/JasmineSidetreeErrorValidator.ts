import SidetreeError from '../lib/common/SidetreeError';

/**
 * Encapsulates the helper functions for the tests.
 */
export default class JasmineSidetreeErrorValidator {

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedErrorCode The expected error code.
   */
  public static expectSidetreeErrorToBeThrown (functionToExcute: () => any, expectedErrorCode: string): void {
    let validated: boolean = false;

    try {
      functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedErrorCode);
        validated = true;
      }
    }

    if (!validated) {
      fail(`Expected error '${expectedErrorCode}' did not occur.`);
    }
  }

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExcute The function to execute.
   * @param expectedErrorCode The expected error code.
   */
  public static async expectSidetreeErrorToBeThrownAsync (functionToExcute: () => Promise<any>, expectedErrorCode: string): Promise<void> {
    let validated: boolean = false;

    try {
      await functionToExcute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedErrorCode);
        validated = true;
      }
    }

    if (!validated) {
      fail(`Expected error '${expectedErrorCode}' did not occur.`);
    }
  }
}
