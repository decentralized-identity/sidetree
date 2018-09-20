import MerkleTree from '../../src/lib/MerkleTree';

describe('MerkleTree', () => {

  const testValues: Buffer[] = [
    Buffer.from('1'),
    Buffer.from('2'),
    Buffer.from('3'),
    Buffer.from('4'),
    Buffer.from('5'),
    Buffer.from('6'),
    Buffer.from('7'),
    Buffer.from('8'),
    Buffer.from('9'),
    Buffer.from('10')
  ];

  it('should throw error if attemping to create a Merkle tree with no leaf node.', () => {
    const merkleTree = MerkleTree.initialize();
    expect(function () { merkleTree.finalize(); }).toThrowError('No value(s) given to construct a Merkle tree.');
  });

  it('of one value should have the root hash equal to the hash of the one value.', () => {
    const merkleTree = MerkleTree.initialize(testValues.slice(0, 1));
    const expectedHashBase64 = 'a4ayc/80/OGda4BO/1o/V0etpOqiLx1JwB5S3beHW0s=';
    const actualHashBase64 = merkleTree.finalize().toString('base64');
    expect(actualHashBase64).toEqual(expectedHashBase64);
  });

});
