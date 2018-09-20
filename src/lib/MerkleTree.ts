import Cryptography from './Cryptography';

/**
 * Class containing a Merkle tree structure and its related operations.
 */
export default class MerkleTree {

  /**
   * Stores the Merkle tree root node once finalize() is called.
   */
  private merkleTreeRootNode?: MerkleNode;

  /**
   * Hashing function usinged by this Merkle tree.
   */
  private hash: (value: Buffer) => Buffer = Cryptography.sha256hash;

  /**
   * Intermediate structure for storing different sizes of balanced Merkle trees that will eventually form one final tree.
   * [0] stores tree of 1 leaf, [1] stores tree of 2 leaves, [2] -> 4 leaves, [3] -> 8 leaves and so on.
   */
  private subtrees: (MerkleNode | undefined) [] = [];
  private valueToMerkleNodeMap = new Map<Buffer, MerkleNode>();

  /**
   * Initializes a MerkleTree that is not finalized.
   * ie. More values can be added to the MerkleTree.
   * @param values Optional values to be added to the Merkle tree.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  public static initialize (
    values?: Buffer[],
    customHashFunction?: (value?: Buffer) => Buffer
  ): MerkleTree {

    const merkleTree = new MerkleTree();

    if (customHashFunction) {
      merkleTree.hash = customHashFunction;
    }

    if (values) {
      values.forEach(value => {
        merkleTree.add(value);
      });
    }

    return merkleTree;
  }

  /**
   * Adds a value to the Merkle tree.
   * TODO: add multi-thread support: allow only 1 add to be invoked at a time.
   * @throws Error if the MerkleTree is finalized.
   */
  public add (value: Buffer) {
    if (this.merkleTreeRootNode) {
      throw new Error('Cannot add more values once the Merkle tree is finalized.');
    }

    // Create a new node and add it to the value -> node lookup map.
    const newNode = { hash: this.hash(value) };
    this.valueToMerkleNodeMap.set(value, newNode);

    // Initialize a subtree of one new leaf node.
    let newSubtree: MerkleNode | undefined = newNode;

    // Insert/merge the new node into the list of subtrees.
    let newSubtreeHeight = 0; // Zero-based height.
    while (newSubtree) {
      // If there is already another tree of the same height,
      // then merge the two subtrees to form a taller subtree.
      if (this.subtrees.length > newSubtreeHeight &&
          this.subtrees[newSubtreeHeight]) {

        // Remove the existing subtree from the list of subtrees
        const existingSubtree = this.subtrees[newSubtreeHeight];
        this.subtrees[newSubtreeHeight] = undefined;

        // Calculate hash(existing subtree hash + new subtree hash)
        // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
        const combinedHashes = Buffer.concat([existingSubtree!.hash, newSubtree.hash]);
        const newHash = Cryptography.sha256hash(combinedHashes);

        // Construct parent node.
        const parent: MerkleNode = {
          hash: newHash,
          firstChild: existingSubtree,
          secondChild: newSubtree,
          parent: undefined
        };

        existingSubtree!.parent = parent; // Used non-null assertion operator because type-checker cannot conclude the fact.
        newSubtree.parent = parent;

        // Set the parent as a taller new subtree to be inserted into the array of subtrees .
        newSubtree = parent;
        newSubtreeHeight++;
      } else { // Else there is no existing subtree with the same height.
        // If the array is already large enough (i.e. the new subtree is not the tallest),
        // just insert it into the array.
        if (this.subtrees.length > newSubtreeHeight) {
          this.subtrees[newSubtreeHeight] = newSubtree;
        } else { // Else this new subtree is the tallest so far, need to add it to the end of array.
          this.subtrees.push(newSubtree);
        }
        newSubtree = undefined;
      }
    }
  }

  /**
   * Finalizes the Merkle tree by computing the final root hash. No new values can be added.
   * Can be called multiple times to retrieve the same Merkle tree root hash.
   * TODO: add multi-thread support: disallow finalize() be called after immediately after finalized check is performed in add()?
   * @returns Merkle tree root hash.
   */
  public finalize (): Buffer {
    // If root hash is already calculated (MerkleTree is finalized), no need to do calculation again.
    if (this.merkleTreeRootNode) {
      return this.merkleTreeRootNode.hash;
    }

    // Merge all the subtrees of different sizes into one single Merkle tree.
    let smallestSubtree: MerkleNode | undefined = undefined;
    let i;
    for (i = 0; i < this.subtrees.length; i++) {
      // If we encounter a subtree.
      let subtree = this.subtrees[i];
      if (subtree) {
        // If there is already a smaller subtree, merge them.
        if (smallestSubtree) {
          // Calculate hash(bigger subtree hash + smaller subtree hash)
          // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
          const combinedHashes = Buffer.concat([subtree!.hash, smallestSubtree.hash]);
          const newHash = Cryptography.sha256hash(combinedHashes);

          // Construct parent node.
          const parent: MerkleNode = {
            hash: newHash,
            firstChild: subtree,
            secondChild: smallestSubtree,
            parent: undefined
          };

          subtree.parent = parent;
          smallestSubtree.parent = parent;

          // The parent becomes the new smallest subtree.
          smallestSubtree = parent;
        } else { // There isn't already a smaller subtree, assign subtree as smallest.
          smallestSubtree = this.subtrees[i];
        }

        this.subtrees[i] = undefined;
      }
    }

    this.merkleTreeRootNode = smallestSubtree;

    if (!this.merkleTreeRootNode) {
      throw new Error('No value(s) given to construct a Merkle tree.');
    }

    return this.merkleTreeRootNode.hash;
  }

  /**
   * Linearize the Merkle tree as a list of values.
   * The output can be fed into initialize(...) to reconstruct the same Merkle tree.
   * This method can also be used to perform custom serialization.
   */
  public linearize (): Buffer[] {
    const values = Array.from(this.valueToMerkleNodeMap.keys());
    return values;
  }

  /**
   * Serailizes the Merkle tree.
   */
  public serialize (): Buffer {
    const values: string[] = [];

    for (let value of this.linearize()) {
      // TODO: revisit choice of encoding.
      const base64Value = value.toString('base64');
      values.push(base64Value);
    }

    const buffer = Buffer.from(JSON.stringify(values));
    return buffer;
  }

  /**
   * Deserailizes the Merkle tree that was serialized using the serialize() function.
   */
  public static deserialize (valuesBuffer: Buffer): MerkleTree {
    const valuesBase64: string[] = JSON.parse(valuesBuffer.toString());
    const values: Buffer[] = [];

    for (let valueBase64 of valuesBase64) {
      values.push(Buffer.from(valueBase64, 'base64'));
    }

    const merkleTree = MerkleTree.initialize(values);
    return merkleTree;
  }

  /**
   * Create a Merkle receipt for the given value.
   */
  public receipt (_value: Buffer): MerkleReceipt {
    throw new Error('Not implemented.');
  }

  /**
   * Proves that the given receipt is valid for the value given.
   */
  public static prove (_value: Buffer, _receipt: MerkleReceipt): boolean {
    throw new Error('Not implemented.');
  }

}

/**
 * Internal representation of a node in a Merkle tree.
 */
interface MerkleNode {
  hash: Buffer;
  parent?: MerkleNode;
  firstChild?: MerkleNode;
  secondChild?: MerkleNode;
}

/**
 * TODO: Class containing a Merkle receipt structure and its related operations.
 */
class MerkleReceipt {
}

export { MerkleReceipt };
