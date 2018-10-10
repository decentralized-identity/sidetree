import { Cas } from '../../src/Cas';

export default class MockCas implements Cas {
  public async write (_content: Buffer): Promise<string> {
    return 'dummyString';
  }

  public async read (_address: string): Promise<Buffer> {
    return new Buffer('dummyString');
  }
}