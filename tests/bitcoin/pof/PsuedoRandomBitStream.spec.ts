import PsuedoRandomBitStream from '../../../lib/bitcoin/pof/PsuedoRandomBitStream';

describe('PsuedoRandomBitStream', () => {
  it('should produce deterministic bit stream', () => {
    const psuedoRandomBitStream1 = new PsuedoRandomBitStream('hello world');
    const psuedoRandomBitStream2 = new PsuedoRandomBitStream('hello world');

    for (let i = 0 ; i < 1024 ; ++i) {
      const bit1 = psuedoRandomBitStream1.getNextBit();
      const bit2 = psuedoRandomBitStream2.getNextBit();
      expect(bit1).toEqual(bit2);
    }
  });

  // sanity check for randomness
  it('should produce 0s and 1s with equi-probability', () => {
    const psuedoRandomBitStream = new PsuedoRandomBitStream('hello world');
    let zeroCount = 0;
    let oneCount = 0;
    for (let i = 0 ; i < 1024 ; ++i) {
      const bit = psuedoRandomBitStream.getNextBit();
      if (bit === 0) {
        zeroCount++;
      } else if (bit === 1) {
        oneCount++;
      } else {
        fail('Invalid output produced by psuedoRandomBitStream');
      }
    }

    expect(zeroCount).toBeGreaterThan(450);
    expect(oneCount).toBeGreaterThan(450);
  });
});
