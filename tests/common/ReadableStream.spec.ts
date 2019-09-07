import * as fs from 'fs';
import ReadableStream from '../../lib/common/ReadableStream';

describe('ReadableStream', () => {

  it('should read all content using readAll().', async () => {
    const inputFilePath = './tests/common/readable-stream-test-input.txt';
    const stream = fs.createReadStream(inputFilePath);
    const content = await ReadableStream.readAll(stream);
    const expectedContent = fs.readFileSync(inputFilePath).toString();

    expect(content.length).toBeGreaterThan(64000);
    expect(content).toEqual(expectedContent);
  });
});
