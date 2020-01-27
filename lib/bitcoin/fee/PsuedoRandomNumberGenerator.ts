import PsuedoRandomBitStream from './PsuedoRandomBitStream';

/**
 * PsuedoRandomNumberGenerator: An object of this class takes in a psuedoranbom bit
 * stream and provides two sampling methods: a bernoulli sampling method and
 * a uniform sampling method that picks a number uniformly at random from a range
 * 0..n-1.
 */
export default class PsuedoRandomNumberGenerator {
  public constructor(private psuedoRandomBitStream: PsuedoRandomBitStream) {}

  /**
   * Get a number uniformly at random between 0 and n-1.
   * This implementation uses the algorithm described in
   * https://arxiv.org/pdf/1304.1916.pdf
   *
   * To see how it works, first consider n that is a power
   * of 2, say 32. The while loop picks 5 random bits and returns
   * the value encoded by the 5 bits as the random number; clearly,
   * any of the values 0...31 are equally likely to be returned as
   * desired.
   *
   * Now consider a non-power-of-2 such as 31. We again pick 5 bits and
   * if these 5 bits encode a value <= 30, we return that value; otherwise,
   * we repeat the process.
   */
  public getRandomNumber(n: number): number {
    let n2 = 1;
    let s = 0;

    while (true) {
      n2 = n2 * 2;
      s = s * 2 + this.psuedoRandomBitStream.getNextBit();

      if (n2 >= n) {
        if (s < n) {
          return s;
        } else {
          n2 = n2 - n;
          s = s - n;
        }
      }
    }
  }
}
