/**
 * Standard cache interface that allows for the storage (store) and retrieval (lookup) of
 * key-value pairs with false negatives: The lookup of a key might return undefined even
 * if the key was previously stored, but if the lookup does return a defined value, the value is
 * guaranteed to be that of the most recent store for the key.
 */
export interface Cache<KeyType, ValueType> {

  /**
   * Store a key-value pair in the cache.
   */
  store (key: KeyType, value: ValueType): void;

  /**
   * Lookup the value for a specified key with possible false negatives. See comment
   * above the interface definition.
   */
  lookup (key: KeyType): ValueType | undefined;
}

/**
 * A simple associative cache that stores the cached objects (key-value pairs)
 * in a fixed size array along with a hashmap indexing the position of each
 * stored key. The current implementation uses a simple random replacement
 * policy.
 */
class FixedSizeCache<KeyType, ValueType> implements Cache<KeyType, ValueType> {

  // Array storing the cached values
  private readonly cachedKeys: Array<KeyType>;

  private readonly cacheSlotValid: Array<boolean>;

  // For any key currently stored in the cache, the map from the key
  // to its slot in the cachedObjects array.
  private readonly keyToValue: Map<KeyType, ValueType> = new Map();

  public constructor (private readonly size: number) {
    this.cachedKeys = new Array(size);
    this.cacheSlotValid = new Array(size);
  }

  // Store the key-value pair in a random index evicting
  // the current object stored at that index if necessary
  public store (key: KeyType, value: ValueType): void {
    const index = Math.floor(Math.random() * this.size);

    if (this.cacheSlotValid[index]) {
      this.keyToValue.delete(this.cachedKeys[index]);
    } else {
      this.cacheSlotValid[index] = true;
    }

    this.cachedKeys[index] = key;
    this.keyToValue.set(key, value);
  }

  public lookup (key: KeyType): ValueType | undefined {
    return this.keyToValue.get(key);
  }
}

/**
 * Factory method to construct a cache.
 */
export function getCache<KeyType, ValueType> (cacheSize: number): Cache<KeyType, ValueType> {
  return new FixedSizeCache<KeyType, ValueType>(cacheSize);
}
