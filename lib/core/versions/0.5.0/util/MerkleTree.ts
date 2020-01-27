import Cryptography from './Cryptography';

/**
 * Class containing a Merkle tree structure and its related operations.
 */
export default class MerkleTree {
  /**
   * Stores the Merkle tree root node once finalize() is called.
   */
  private merkleTreeRootNode?: IMerkleNode;

  /**
   * Hashing function usinged by this Merkle tree.
   */
  private hash: (value: Buffer) => Buffer = Cryptography.sha256hash;

  /**
   * Intermediate structure for storing different sizes of balanced Merkle trees that will eventually form one final tree.
   * [0] stores tree of 1 leaf, [1] stores tree of 2 leaves, [2] -> 4 leaves, [3] -> 8 leaves and so on.
   */
  private subtrees: (IMerkleNode | undefined)[] = [];

  /**
   * A map such that given a value, the corresponding leaf hash node is located.
   */
  private valueToMerkleNodeMap = new Map<Buffer, IMerkleNode>();

  /**
   * Creates a MerkleTree.
   * @param values values to be added to the Merkle tree.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  public static create(
    values: Buffer[],
    customHashFunction?: (value?: Buffer) => Buffer
  ): MerkleTree {
    return new MerkleTree(values, customHashFunction);
  }

  /**
   * Gets the Merkle tree root hash.
   */
  get rootHash(): Buffer {
    // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
    return this.merkleTreeRootNode!.hash;
  }

  /**
   * Create a Merkle receipt for the given value.
   * @returns Merkle receipt in the format specified by the Sidetree protocol.
   */
  public receipt(value: Buffer): IMerkleReceiptEntry[] {
    const receipt: IMerkleReceiptEntry[] = [];
    let node = this.valueToMerkleNodeMap.get(value);

    while (node && node.parent) {
      const parent = node.parent;

      if (node.hash.equals(parent.leftChild!.hash)) {
        receipt.push({ side: 'right', hash: parent.rightChild!.hash });
      } else {
        receipt.push({ side: 'left', hash: parent.leftChild!.hash });
      }
      node = parent;
    }

    return receipt;
  }

  /**
   * Proves that the given receipt is valid for the given value and Merkle root.
   * If receipt is not given, the the hash of the valude must directly equal to the given Merkle root.
   * @param receipt Merkle receipt in the format specified by the Sidetree protocol.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  public static prove(
    value: Buffer,
    merkleRoot: Buffer,
    receipt: IMerkleReceiptEntry[],
    customHashFunction?: (value?: Buffer) => Buffer
  ): boolean {
    let hashFunction: (value: Buffer) => Buffer = Cryptography.sha256hash;
    if (customHashFunction) {
      hashFunction = customHashFunction;
    }

    let hash = hashFunction(value);

    // If receipt is not given, the the hash of the valude must directly equal to the given Merkle root.
    if (!receipt || receipt.length === 0) {
      return hash.equals(merkleRoot);
    }

    let i = 0;
    do {
      let combinedBuffer;
      const entry = receipt[i];
      if (entry.side === 'left') {
        combinedBuffer = Buffer.concat([entry.hash, hash]);
      } else {
        combinedBuffer = Buffer.concat([hash, entry.hash]);
      }

      hash = hashFunction(combinedBuffer);
      i++;
    } while (i < receipt.length);

    return hash.equals(merkleRoot);
  }

  /**
   * Creates a MerkleTree.
   * @param values values to be added to the Merkle tree.
   * @param customHashFunction Optional custom hash function. SHA256 is used if not specified.
   */
  private constructor(
    values: Buffer[],
    customHashFunction?: (value?: Buffer) => Buffer
  ) {
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
  private add(value: Buffer) {
    // Create a new node and add it to the value -> node lookup map.
    const newNode = { hash: this.hash(value) };
    this.valueToMerkleNodeMap.set(value, newNode);

    // Initialize a subtree of one new leaf node.
    let newSubtree: IMerkleNode | undefined = newNode;

    // Insert/merge the new node into the list of subtrees.
    let newSubtreeHeight = 0; // Zero-based height.
    while (newSubtree) {
      // If there is already another tree of the same height,
      // then merge the two subtrees to form a taller subtree.
      if (
        this.subtrees.length > newSubtreeHeight &&
        this.subtrees[newSubtreeHeight]
      ) {
        // Remove the existing subtree from the list of subtrees
        const existingSubtree = this.subtrees[newSubtreeHeight];
        this.subtrees[newSubtreeHeight] = undefined;

        // Construct parent node.
        // Used the '!' non-null assertion operator because type-checker cannot conclude the fact.
        const parent = this.createParent(existingSubtree!, newSubtree);

        // Set the parent as a taller new subtree to be inserted into the array of subtrees .
        newSubtree = parent;
        newSubtreeHeight++;
      } else {
        // Else there is no existing subtree with the same height.
        // If the array is already large enough (i.e. the new subtree is not the tallest),
        // just insert it into the array.
        if (this.subtrees.length > newSubtreeHeight) {
          this.subtrees[newSubtreeHeight] = newSubtree;
        } else {
          // Else this new subtree is the tallest so far, need to add it to the end of array.
          this.subtrees.push(newSubtree);
        }
        newSubtree = undefined;
      }
    }
  }

  /**
   * Combines the list of balanced Merkle subtrees to form the final Merkle tree.
   */
  private finalize() {
    // Merge all the subtrees of different sizes into one single Merkle tree.
    let smallestSubtree: IMerkleNode | undefined = undefined;
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
        } else {
          // There isn't already a smaller subtree, assign subtree as smallest.
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
  private createParent(left: IMerkleNode, right: IMerkleNode): IMerkleNode {
    // Calculate hash(bigger subtree hash + smaller subtree hash)
    const combinedHashes = Buffer.concat([left.hash, right.hash]);
    const newHash = this.hash(combinedHashes);

    // Construct parent node.
    const parent: IMerkleNode = {
      hash: newHash,
      leftChild: left,
      rightChild: right,
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
interface IMerkleNode {
  hash: Buffer;
  parent?: IMerkleNode;
  leftChild?: IMerkleNode;
  rightChild?: IMerkleNode;
}

/**
 * Represents an entry of many inside a Merkle receipt.
 */
interface IMerkleReceiptEntry {
  side: string;
  hash: Buffer;
}

export { IMerkleReceiptEntry };
