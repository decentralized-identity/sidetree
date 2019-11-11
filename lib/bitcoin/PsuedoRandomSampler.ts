import * as crypto from 'crypto';

/**
 * Bit type: 0 or 1
 */
export type Bit = 0 | 1;

/**
 * An instance of this class generates a psuedo-random
 * bit stream based on an initial hexadecimal seed.
 */
export class PsuedoRandomBitStream {

  // The current sequence of pre-computed psuedo-random bits
  private psuedoRandomBits: Bit[];

  // The index into psuedoRandomBits for the next bit
  private currentIndex: number = 0;

  /**
   * @param hexSeed Hexadecimal seed value
   */
  public constructor (private hexSeed: string) {
    this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(PsuedoRandomBitStream.rehash(this.hexSeed));
  }

  /**
   * Get the next psuedo-random bit
   */
  public getNextBit (): Bit {
    const bit = this.psuedoRandomBits[this.currentIndex];
    this.currentIndex++;

    if (this.currentIndex === this.psuedoRandomBits.length) {
      this.hexSeed = PsuedoRandomBitStream.rehash(this.hexSeed);
      this.psuedoRandomBits = PsuedoRandomBitStream.getBitsFromHex(this.hexSeed);
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

/**
 * PsuedoRandomGenerator: An object of this class takes in a psuedoranbom bit
 * stream and provides two sampling methods: a bernoulli sampling method and
 * a uniform sampling method that picks a number uniformly at random from a range
 * 0..n-1.
 */
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
   * The 'result' variable below is computing the i'th digit of the
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
        n = n - d;
        result = 1;
      } else {
        result = 0;
      }

    } while (this.psuedoRandomBitStream.getNextBit() === 0);

    return result;
  }

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

/**
 * Implement the reservoir sampling technique which maintains a uniform random
 * sample over a "stream" of unknown size (https://en.wikipedia.org/wiki/Reservoir_sampling)
 *
 * We can add any number of elements to be considered for sampling and at any point request
 * a sample of preconfigured size over the elements that have been added so far.
 */
export class ReservoirSampler {

  /**
   * Psuedo-randome generator for various random numbers we need for sampling
   */
  private psuedoRandomGenerator: PsuedoRandomGenerator | undefined;

  /**
   * The current sample
   */
  private sample: string[];

  /**
   * Number of elements added so far.
   */
  private streamSize: number = 0;

  public constructor (private sampleSize: number) {
    this.psuedoRandomGenerator = undefined;
    this.sample = new Array<string>(this.sampleSize);
  }

  /**
   * Add a new element to be considered for future sampling
   */
  public addElement (element: string): void {

    // If we have not reached our sampling limit, we can simply add
    // the current element to the sample
    if (this.streamSize < this.sampleSize) {
      this.sample[this.streamSize] = element;
      this.streamSize++;
      return;
    }

    // We have a full sampleSize of samples at this point.
    // This element is picked to be in the sample with probability 1/streamSize
    this.streamSize++;

    // Pick a random index [0 .. streamSize] and if the index < sampleSize, replace
    // the element at that index.
    const randIndex = this.psuedoRandomGenerator!.getRandomNumber(this.streamSize);

    if (randIndex < this.sampleSize) {
      // evict the current element at randIndex and store element instead
      this.sample[randIndex] = element;
    }
  }

  /**
   * Reset the psuedo-random seed with a new seed for future random
   * value generation.
   */
  public resetPsuedoRandomSeed (hexSeed: string) {
    const psuedoRandomBitStream = new PsuedoRandomBitStream(hexSeed);
    this.psuedoRandomGenerator = new PsuedoRandomGenerator(psuedoRandomBitStream);
  }

  /**
   * Get the current sample. We return the entire sample unless we have
   * seen less than sampleSize elements, in which case we return all
   * the elements seen.
   */
  public getSample (): string[] {
    const currentSampleSize = Math.min(this.sampleSize, this.streamSize);
    return this.sample.slice(0, currentSampleSize);
  }

  /** Reset the sampler for a new stream */
  public clear () {
    this.streamSize = 0;
  }
}
