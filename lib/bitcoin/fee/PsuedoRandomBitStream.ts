import * as crypto from 'crypto';

/**
 * Bit type: 0 or 1
 */
type Bit = 0 | 1;

/**
 * An instance of this class generates a psuedo-random
 * bit stream based on an initial hexadecimal seed.
 */
export default class PsuedoRandomBitStream {
  // The current sequence of pre-computed psuedo-random bits
  private psuedoRandomBits: Bit[];

  // The index into psuedoRandomBits for the next bit
  private currentIndex: number = 0;

  /**
   * @param hexSeed Hexadecimal seed value
   */
  public constructor(private hexSeed: string) {
    this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(
      PsuedoRandomBitStream.rehash(this.hexSeed)
    );
  }

  /**
   * Get the next psuedo-random bit
   */
  public getNextBit(): Bit {
    const bit = this.psuedoRandomBits[this.currentIndex];
    this.currentIndex++;

    if (this.currentIndex === this.psuedoRandomBits.length) {
      this.hexSeed = PsuedoRandomBitStream.rehash(this.hexSeed);
      this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(
        this.hexSeed
      );
      this.currentIndex = 0;
    }

    return bit;
  }

  /**
   * Convert a hex string to an array of bits
   * @param hexStr hex string
   */
  private static getBitsFromHex(hexStr: string): Bit[] {
    // Convert each hex character to a nibble (number between 0 and 16)
    const nibbles = hexStr.split('').map(c => parseInt(c, 16));
    // Convert each nibble to an bit array and flatten the resulting
    // array of arrays.
    return ([] as Bit[]).concat.apply(
      [],
      nibbles.map(n => this.getBitsFromNibble(n))
    );
  }

  /**
   * Convert a number in the range 0..15 to an array of 4 bits
   * of its binary representation.
   */
  private static getBitsFromNibble(nibble: number): Bit[] {
    const bits = new Array<Bit>(4);
    for (let i = 3; i >= 0; i--) {
      bits[i] = (nibble % 2) as Bit; // We know % 2 is 0 or 1
      nibble = Math.floor(nibble / 2);
    }
    return bits;
  }

  private static rehash(seed: string): string {
    return crypto
      .createHash('sha256')
      .update(seed)
      .digest('hex');
  }
}
