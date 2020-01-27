import PsuedoRandomBitStream from './PsuedoRandomBitStream';
import PsuedoRandomNumberGenerator from './PsuedoRandomNumberGenerator';

/**
 * Implement the reservoir sampling technique which maintains a uniform random
 * sample over a "stream" of unknown size (https://en.wikipedia.org/wiki/Reservoir_sampling)
 *
 * We can add any number of elements to be considered for sampling and at any point request
 * a sample of preconfigured size over the elements that have been added so far.
 */
export default class ReservoirSampler {
  /**
   * Psuedo-randome generator for various random numbers we need for sampling
   */
  private psuedoRandomGenerator: PsuedoRandomNumberGenerator | undefined;

  /**
   * The current sample
   */
  private sample: string[];

  /**
   * Number of elements added so far.
   */
  private streamSize: number = 0;

  public constructor(private sampleSize: number) {
    this.psuedoRandomGenerator = undefined;
    this.sample = new Array<string>(this.sampleSize);
  }

  /**
   * Add a new element to be considered for future sampling
   */
  public addElement(element: string): void {
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
    const randIndex = this.psuedoRandomGenerator!.getRandomNumber(
      this.streamSize
    );

    if (randIndex < this.sampleSize) {
      // evict the current element at randIndex and store element instead
      this.sample[randIndex] = element;
    }
  }

  /**
   * Reset the psuedo-random seed with a new seed for future random
   * value generation.
   */
  public resetPsuedoRandomSeed(hexSeed: string) {
    const psuedoRandomBitStream = new PsuedoRandomBitStream(hexSeed);
    this.psuedoRandomGenerator = new PsuedoRandomNumberGenerator(
      psuedoRandomBitStream
    );
  }

  /**
   * Get the current sample. We return the entire sample unless we have
   * seen less than sampleSize elements, in which case we return all
   * the elements seen.
   */
  public getSample(): string[] {
    const currentSampleSize = Math.min(this.sampleSize, this.streamSize);
    return this.sample.slice(0, currentSampleSize);
  }

  /** Reset the sampler for a new stream */
  public clear() {
    this.streamSize = 0;
  }
}
