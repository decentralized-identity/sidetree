import Cryptography from '../../../lib/core/versions/latest/util/Cryptography';
import MerkleTree from '../../../lib/core/versions/latest/util/MerkleTree';

describe('MerkleTree', () => {

  // Test values.
  const testValues: Buffer[] = [
    Buffer.from('0'),
    Buffer.from('1'),
    Buffer.from('2'),
    Buffer.from('3'),
    Buffer.from('4'),
    Buffer.from('5'),
    Buffer.from('6'),
    Buffer.from('7'),
    Buffer.from('8'),
    Buffer.from('9')
  ];

  // Test value hashes in HEX.
  const valueToHashMap: { [key: string]: string } = {
    ['0']: '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9',
    ['1']: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
    ['2']: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    ['3']: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    ['4']: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    ['5']: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    ['6']: 'e7f6c011776e8db7cd330b54174fd76f7d0216b612387a5ffcfb81e6f0919683',
    ['7']: '7902699be42c8a8e46fbbb4501726517e86b22c56a189f7625a6da49081b2451',
    ['8']: '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a3',
    ['9']: '19581e27de7ced00ff1ce50b2047e7a567c76b1cbaebabe5ef03f7c3017bb5b7'
  };

  const value01Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['0'] + valueToHashMap['1'], 'hex'));
  const value23Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['2'] + valueToHashMap['3'], 'hex'));
  const value45Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['4'] + valueToHashMap['5'], 'hex'));
  const value67Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['6'] + valueToHashMap['7'], 'hex'));
  const value89Hash = Cryptography.sha256hash(Buffer.from(valueToHashMap['8'] + valueToHashMap['9'], 'hex'));

  const value0123Hash = Cryptography.sha256hash(Buffer.concat([value01Hash, value23Hash]));
  const value4567Hash = Cryptography.sha256hash(Buffer.concat([value45Hash, value67Hash]));

  const value01234567Hash = Cryptography.sha256hash(Buffer.concat([value0123Hash, value4567Hash]));

  it('should produce the correct root hash and receipts for a tree of just 1 value.', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 1));
    const actualHash = merkleTree.rootHash.toString('hex');
    const expectedHash = valueToHashMap['0'];
    expect(actualHash).toEqual(expectedHash);

    const receipt1 = merkleTree.receipt(testValues[0]);
    const receiptValidated = MerkleTree.prove(testValues[0], merkleTree.rootHash, receipt1);
    expect(receiptValidated).toBeTruthy();
  });

  it('should produce the correct root hash and receipts for a tree of 2 values.', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 2));
    const actualHash = merkleTree.rootHash.toString();
    const expectedHash = value01Hash.toString();
    expect(actualHash).toEqual(expectedHash);

    let receipt0 = merkleTree.receipt(testValues[0]);
    let receipt1 = merkleTree.receipt(testValues[1]);
    expect(MerkleTree.prove(testValues[0], merkleTree.rootHash, receipt0)).toBeTruthy();
    expect(MerkleTree.prove(testValues[1], merkleTree.rootHash, receipt1)).toBeTruthy();
  });

  it('should produce the correct root hash and receipts for a balanced tree (8 values).', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 8));
    const actualHashHex = merkleTree.rootHash.toString();
    const expectedHash = value01234567Hash.toString();
    expect(actualHashHex).toEqual(expectedHash);

    let receipt0 = merkleTree.receipt(testValues[0]);
    let receipt1 = merkleTree.receipt(testValues[1]);
    let receipt2 = merkleTree.receipt(testValues[2]);
    let receipt3 = merkleTree.receipt(testValues[3]);
    let receipt4 = merkleTree.receipt(testValues[4]);
    let receipt5 = merkleTree.receipt(testValues[5]);
    let receipt6 = merkleTree.receipt(testValues[6]);
    let receipt7 = merkleTree.receipt(testValues[7]);
    expect(MerkleTree.prove(testValues[0], merkleTree.rootHash, receipt0)).toBeTruthy();
    expect(MerkleTree.prove(testValues[1], merkleTree.rootHash, receipt1)).toBeTruthy();
    expect(MerkleTree.prove(testValues[2], merkleTree.rootHash, receipt2)).toBeTruthy();
    expect(MerkleTree.prove(testValues[3], merkleTree.rootHash, receipt3)).toBeTruthy();
    expect(MerkleTree.prove(testValues[4], merkleTree.rootHash, receipt4)).toBeTruthy();
    expect(MerkleTree.prove(testValues[5], merkleTree.rootHash, receipt5)).toBeTruthy();
    expect(MerkleTree.prove(testValues[6], merkleTree.rootHash, receipt6)).toBeTruthy();
    expect(MerkleTree.prove(testValues[7], merkleTree.rootHash, receipt7)).toBeTruthy();
  });

  it('should produce the correct root hash and receipts for an unbalanced tree (10 values).', () => {
    const merkleTree = MerkleTree.create(testValues.slice(0, 10));
    const actualHashHex = merkleTree.rootHash.toString();
    const expectedRootHash = Cryptography.sha256hash(Buffer.concat([value01234567Hash, value89Hash])).toString();
    expect(actualHashHex).toEqual(expectedRootHash);

    let receipt0 = merkleTree.receipt(testValues[0]);
    let receipt1 = merkleTree.receipt(testValues[1]);
    let receipt2 = merkleTree.receipt(testValues[2]);
    let receipt3 = merkleTree.receipt(testValues[3]);
    let receipt4 = merkleTree.receipt(testValues[4]);
    let receipt5 = merkleTree.receipt(testValues[5]);
    let receipt6 = merkleTree.receipt(testValues[6]);
    let receipt7 = merkleTree.receipt(testValues[7]);
    let receipt8 = merkleTree.receipt(testValues[8]);
    let receipt9 = merkleTree.receipt(testValues[9]);
    expect(MerkleTree.prove(testValues[0], merkleTree.rootHash, receipt0)).toBeTruthy();
    expect(MerkleTree.prove(testValues[1], merkleTree.rootHash, receipt1)).toBeTruthy();
    expect(MerkleTree.prove(testValues[2], merkleTree.rootHash, receipt2)).toBeTruthy();
    expect(MerkleTree.prove(testValues[3], merkleTree.rootHash, receipt3)).toBeTruthy();
    expect(MerkleTree.prove(testValues[4], merkleTree.rootHash, receipt4)).toBeTruthy();
    expect(MerkleTree.prove(testValues[5], merkleTree.rootHash, receipt5)).toBeTruthy();
    expect(MerkleTree.prove(testValues[6], merkleTree.rootHash, receipt6)).toBeTruthy();
    expect(MerkleTree.prove(testValues[7], merkleTree.rootHash, receipt7)).toBeTruthy();
    expect(MerkleTree.prove(testValues[8], merkleTree.rootHash, receipt8)).toBeTruthy();
    expect(MerkleTree.prove(testValues[9], merkleTree.rootHash, receipt9)).toBeTruthy();
  });
});
