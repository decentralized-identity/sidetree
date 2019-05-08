import { URL } from 'url';

/**
 * Class containing reusable string operations.
 */
export default class String {
  /**
   * Verifies if the given url string is valid.
   */
  static isValidUrl (url: string): boolean {
    try {
      // tslint:disable-next-line:no-unused-expression
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
