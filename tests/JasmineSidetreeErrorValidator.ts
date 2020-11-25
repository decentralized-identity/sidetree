import SidetreeError from '../lib/common/SidetreeError';

/**
 * Encapsulates the helper functions for the tests.
 */
export default class JasmineSidetreeErrorValidator {

  /**
   * Fails the current spec if the execution of the function does not throw the expected SidetreeError.
   *
   * @param functionToExecute The function to execute.
   * @param expectedErrorCode The expected error code.
   * @param expectedContainedStringInMessage The string expected to be part of (need not be full error message) the error message.
   */
  public static expectSidetreeErrorToBeThrown (functionToExecute: () => any, expectedErrorCode: string, expectedContainedStringInMessage?: string): void {
    let validated: boolean = false;

    try {
      functionToExecute();
    } catch (e) {
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedErrorCode);

        if (expectedContainedStringInMessage !== undefined) {
          expect(e.message).toContain(expectedContainedStringInMessage);
        }

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
   * @param functionToExecute The function to execute.
   * @param expectedErrorCode The expected error code.
   * @param expectedContainedStringInMessage The string expected to be part of (need not be full error message) the error message.
   */
  public static async expectSidetreeErrorToBeThrownAsync (
    functionToExecute: () => Promise<any>,
    expectedErrorCode: string,
    expectedContainedStringInMessage?: string
  ): Promise<void> {
    let validated: boolean = false;
    let actualError;

    try {
      await functionToExecute();
    } catch (e) {
      actualError = e;
      if (e instanceof SidetreeError) {
        expect(e.code).toEqual(expectedErrorCode);

        if (expectedContainedStringInMessage !== undefined) {
          expect(e.message).toContain(expectedContainedStringInMessage);
        }

        validated = true;
      }
    }

    if (!validated) {
      fail(`Expected error '${expectedErrorCode}' did not occur. Instead got '${actualError.code}'`);
    }
  }
}
