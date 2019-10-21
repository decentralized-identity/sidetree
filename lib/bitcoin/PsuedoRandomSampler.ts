import * as crypto from 'crypto';

/**
 * Bit type: 0 or 1
 */
export type Bit = 0 | 1;

/**
 * An instance of this class generates a psuedo-random
 * bit stream based on an initial hexadecimal seed. The initial seed
 * is read off directly so it should have some psuedo-random properties
 * (e.g., sha256 hash). Once the initial seed bits are exhausted, the
 * seed is sha256 hashed to get the next 256 bits.
 */
export class PsuedoRandomBitStream {

  // The current sequence of pre-computed psuedo-random bits
  private psuedoRandomBits: Bit[];

  // The index into psuedoRandomBits for the next bit
  private currentIndex: number = 0;

  public constructor (private seed: string) {
    this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(this.seed);
  }

  /**
   * Get the next psuedo-random bit
   */
  public getNextBit (): Bit {
    const bit = this.psuedoRandomBits[this.currentIndex];
    this.currentIndex++;

    if (this.currentIndex === this.psuedoRandomBits.length) {
      this.seed = PsuedoRandomBitStream.rehash(this.seed);
      this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(this.seed);
      this.currentIndex = 0;
    }

    return bit;
  }

  /**
   * Convert a hex string to an array of bits
   * @param hexStr hex string
   */
  private static getBitsFromHex (hexStr: string): Bit[] {
    // Convert each hex character to a nibble (number between 0 and 16)
    const nibbles = hexStr.split('').map(c => parseInt(c, 16));
    // Convert each nibble to an bit array and flatten the resulting
    // array of arrays.
    return ([] as Bit[]).concat.apply([], nibbles.map(n => this.getBitsFromNibble(n)));
  }

  /**
   * Convert a number in the range 0..15 to an array of 4 bits
   * of its binary representation.
   */
  private static getBitsFromNibble (nibble: number): Bit[] {
    const bits = new Array<Bit>(4);
    for (let i = 3 ; i >= 0 ; i--) {
      bits[i] = (nibble % 2) as Bit; // We know % 2 is 0 or 1
      nibble = Math.floor(nibble / 2);
    }
    return bits;
  }

  private static rehash (seed: string): string {
    return crypto.createHash('sha256').update(seed).digest('hex');
  }
}

export class PsuedoRandomGenerator {

  public constructor (private psuedoRandomBitStream: PsuedoRandomBitStream) {

  }

  /**
   * Psuedorandom coin toss that returns 1 with probability (n/d)
   * and 0 with probability (1 - n/d).
   *
   * How does this work? Consider sampling with 1/3 probability. As
   * a binary decimal, 1/3 would be written as .010101...., meaning
   * 1/3 = 0 x 1/2 + 1 x 1/4 + 0 x 1/8 + 1 x 1/16 + ...
   *
   * The result variable below is computing the i'th digit of the
   * binary representation of n/d; for 1/3, the sequence of result
   * values is 010101 .... The while check is implementing a
   * geometric distribution that is picking the i'th digit with
   * probability 1/2^i. The probability that we return 1 is,
   * 0 x 1/2 + 1 x 1/4 + 0 x 1/8 + 1 x 1/16 + ... which is 1/3 as
   * required.
   */
  public getBernoulliSample (n: number, d: number): Bit {
    let result: Bit;

    do {
      n = n * 2;

      if (n >= d) {
        n = d - n;
        result = 1;
      } else {
        result = 0;
      }

    } while (this.psuedoRandomBitStream.getNextBit() === 0);

    return result;
  }

  /**
   * Get a number uniformly at random between 0 and n-1.
   */
  public getRandomNumber (n: number): number {
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
