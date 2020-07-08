/**
 * A class that can generate data for basic types.
 */
export default class DataGenerator {

  /**
   * Generates a random integer between 0 and the specified max number.
   * @param max Maximum allowe integer value. Defaults to 100;
   */
  public static generateInteger (max: number = 100): number {
    return Math.round(Math.random() * max);
  }
}
