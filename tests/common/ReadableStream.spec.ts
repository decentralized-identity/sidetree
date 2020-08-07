import * as fs from 'fs';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ReadableStream from '../../lib/common/ReadableStream';
import SharedErrorCode from '../../lib/common/SharedErrorCode';

describe('ReadableStream', () => {
  it('should read all content using readAll().', async () => {
    const inputFilePath = './tests/common/readable-stream-test-input.txt';
    const stream = fs.createReadStream(inputFilePath);
    const content = await ReadableStream.readAll(stream);
    const expectedContent = fs.readFileSync(inputFilePath);

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

  it('should throw error if stream exceeds the max allowed size.', async (done) => {
    const inputFilePath = './tests/bitcoin/testData/bitcoinTwoBlocksRawDataHex.txt';
    const stream = fs.createReadStream(inputFilePath);
    const maxAllowedContentSize = 100;

    await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
      () => ReadableStream.readAll(stream, maxAllowedContentSize),
      SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded
    );

    done();
  });
});
