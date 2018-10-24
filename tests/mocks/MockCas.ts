import { Cas } from '../../src/Cas';

/**
 * Mock CAS class for testing.
 */
export default class MockCas implements Cas {
  public async write (_content: Buffer): Promise<string> {
    return 'dummyString';
  }

  public async read (_address: string): Promise<Buffer> {
    return Buffer.from('dummyString');
  }
}
