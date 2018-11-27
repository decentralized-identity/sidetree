import { Cas } from '../../src/Cas';

/**
 * Implementation of a CAS class for testing. Inserting
 * a buffer simply pushes the buffer to an array and
 * returns the position of the array as address.
 */
export default class MockCas implements Cas {
  /** An array that stores the given content. */
  bufs: Buffer[] = [];

  public async write (content: Buffer): Promise<string> {
    this.bufs.push(content);
    return (this.bufs.length - 1).toString();
  }

  public async read (address: string): Promise<Buffer> {
    // See write above. Address is simply the (stringified)
    // index of the bufs array where corresponding buffer is stored.
    const intAddress = +address;
    return this.bufs[intAddress];
  }
}
