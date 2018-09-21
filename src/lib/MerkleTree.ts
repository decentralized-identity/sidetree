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

  /**
   * A map such that given a value, the corresponding leaf hash node is located.
   */
  private valueToMerkleNodeMap = new Map<Buffer, MerkleNode>();

  /**
   * Creates a MerkleTree.
   * @param values values to be added to the Merkle tree.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  public static create (
    values: Buffer[],
    customHashFunction?: (value?: Buffer) => Buffer)
    : MerkleTree {
    return new MerkleTree(values, customHashFunction);
  }

  /**
   * Gets the Merkle tree root hash.
   */
  get rootHash (): Buffer {
    // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
    return this.merkleTreeRootNode!.hash;
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

  /**
   * Creates a MerkleTree.
   * @param values values to be added to the Merkle tree.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  private constructor (
    values: Buffer[],
    customHashFunction?: (value?: Buffer) => Buffer) {
    if (!values) {
      throw new Error('No value(s) given to construct a Merkle tree.');
    }

    if (customHashFunction) {
      this.hash = customHashFunction;
    }

    values.forEach(value => {
      this.add(value);
    });

    this.finalize();
  }

  /**
   * Adds a value to the current list of balanced Merkles subtrees in 'this.subtrees
   * such that it always maintains the smallest number of balanced trees.
   * The list of balanced Merkle subtrees will be combined to form the final Merkle tree when finalize() is called.
   * Also adds the value to valueToMerkleNodeMap such that the corresponding leaf hash node can be located quickly.
   */
  private add (value: Buffer) {
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

        // Construct parent node.
        // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
        const parent = this.createParent(existingSubtree!, newSubtree);

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
   * Combines the list of balanced Merkle subtrees to form the final Merkle tree.
   */
  private finalize () {
    // Merge all the subtrees of different sizes into one single Merkle tree.
    let smallestSubtree: MerkleNode | undefined = undefined;
    let i;
    for (i = 0; i < this.subtrees.length; i++) {
      // If we encounter a subtree.
      let subtree = this.subtrees[i];
      if (subtree) {
        // If there is already a smaller subtree, merge them.
        if (smallestSubtree) {
          // Construct parent node.
          const parent = this.createParent(subtree, smallestSubtree);

          // The parent becomes the new smallest subtree.
          smallestSubtree = parent;
        } else { // There isn't already a smaller subtree, assign subtree as smallest.
          smallestSubtree = this.subtrees[i];
        }

        this.subtrees[i] = undefined;
      }
    }

    this.merkleTreeRootNode = smallestSubtree;
  }

  /**
   * Creates a parent Merkle tree node given two child nodes.
   */
  private createParent (left: MerkleNode, right: MerkleNode): MerkleNode {
    // Calculate hash(bigger subtree hash + smaller subtree hash)
    const combinedHashes = Buffer.concat([left.hash, right.hash]);
    const newHash = this.hash(combinedHashes);

    // Construct parent node.
    const parent: MerkleNode = {
      hash: newHash,
      firstChild: left,
      secondChild: right,
      parent: undefined
    };

    left.parent = parent;
    right.parent = parent;

    return parent;
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
