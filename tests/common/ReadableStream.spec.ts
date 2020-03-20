import * as fs from 'fs';
import ReadableStream from '../../lib/common/ReadableStream';

describe('ReadableStream', () => {
  it('should read all content using readAll().', async () => {
    const inputFilePath = './tests/common/readable-stream-test-input.txt';
    const stream = fs.createReadStream(inputFilePath);
    const content = await ReadableStream.readAll(stream);
    const expectedContent = fs.readFileSync(inputFilePath);

    expect(content.length).toBeGreaterThan(64000);
    expect(content).toEqual(expectedContent);
  });

  it('should read all content using readAll() with expected length.', async () => {
    const inputFilePath = './tests/common/readable-stream-test-input.txt';
    const stream = fs.createReadStream(inputFilePath);
    const expectedContent = fs.readFileSync(inputFilePath);
    const content = await ReadableStream.readAll(stream, expectedContent.length);

    expect(content.length).toBeGreaterThan(64000);
    expect(content).toEqual(expectedContent);
  });

  it('should read buffer content using readAll().', async () => {
    const inputFilePath = './tests/common/test.png';
    const stream = fs.createReadStream(inputFilePath);
    const content = await ReadableStream.readAll(stream);
    const expectedContent = fs.readFileSync(inputFilePath);

    expect(content).toEqual(expectedContent);
  });

  it('should read buffer content using readAll() with expected length.', async () => {
    const inputFilePath = './tests/common/test.png';
    const stream = fs.createReadStream(inputFilePath);
    const expectedContent = fs.readFileSync(inputFilePath);
    const content = await ReadableStream.readAll(stream, expectedContent.length);

    expect(content).toEqual(expectedContent);
  });

  it('should throw if contentLength is negative.', async () => {
    const inputFilePath = './tests/common/test.png';
    const stream = fs.createReadStream(inputFilePath);
    try {
      await ReadableStream.readAll(stream, -1);
      fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('contentLength must not be negative');
    }
  });

  it('should throw if contentLength is too small.', async () => {
    const inputFilePath = './tests/common/test.png';
    const stream = fs.createReadStream(inputFilePath);
    try {
      await ReadableStream.readAll(stream, 1);
      fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('contentLength must equal length of data on stream');
    }
  });

  it('should throw if contentLength is too large.', async () => {
    const inputFilePath = './tests/common/test.png';
    const stream = fs.createReadStream(inputFilePath);
    try {
      await ReadableStream.readAll(stream, 10000);
      fail('should have thrown');
    } catch (error) {
      expect(error.message).toContain('contentLength must equal length of data on stream');
    }
  });
});
