import Cryptography from '../../src/lib/Cryptography';
import MerkleTree from '../../src/lib/MerkleTree';

describe('MerkleTree', () => {

  // Test values.
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

  // Test value hashes in HEX.
  const valueToHashMap: { [key: string]: string } = {
    ['1']: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
    ['2']: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    ['3']: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    ['4']: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    ['5']: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    ['6']: 'e7f6c011776e8db7cd330b54174fd76f7d0216b612387a5ffcfb81e6f0919683',
    ['7']: '7902699be42c8a8e46fbbb4501726517e86b22c56a189f7625a6da49081b2451',
    ['8']: '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a3',
    ['9']: '19581e27de7ced00ff1ce50b2047e7a567c76b1cbaebabe5ef03f7c3017bb5b7',
    ['10']: '4a44dc15364204a80fe80e9039455cc1608281820fe2b24f1e5233ade6af1dd5',
  };

  const value12Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['1'] + valueToHashMap['2'], 'hex'));
  const value34Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['3'] + valueToHashMap['4'], 'hex'));
  const value56Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['5'] + valueToHashMap['6'], 'hex'));
  const value78Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['7'] + valueToHashMap['8'], 'hex'));
  const value910Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['9'] + valueToHashMap['10'], 'hex'));
  
  const value1234Hash = Cryptography.sha256hash(Buffer.concat([value12Hash, value34Hash]));
  const value5678Hash = Cryptography.sha256hash(Buffer.concat([value56Hash, value78Hash]));
  
  const value12345678Hash = Cryptography.sha256hash(Buffer.concat([value1234Hash, value5678Hash]));

  it('should produce the correct root hash for a tree of just 1 value.', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 1));
    const actualHash = merkleTree.rootHash.toString('hex');
    const expectedHash = valueToHashMap['1'];
    expect(actualHash).toEqual(expectedHash);
  });

  it('should produce the correct root hash for a tree of 2 values.', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 2));
    const actualHash = merkleTree.rootHash.toString();
    const expectedHash = value12Hash.toString();
    expect(actualHash).toEqual(expectedHash);
  });

  it('should produce the correct root hash for a balanced tree (8 values).', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 8));
    const actualHashHex = merkleTree.rootHash.toString();
    const expectedHash = value12345678Hash.toString();
    expect(actualHashHex).toEqual(expectedHash);
  });

  it('should produce the correct root hash for an unbalanced tree (10 values).', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 10));
    const actualHashHex = merkleTree.rootHash.toString();
    const expectedRootHash = Cryptography.sha256hash(Buffer.concat([value12345678Hash, value910Hash])).toString();
    expect(actualHashHex).toEqual(expectedRootHash);
  });
});
