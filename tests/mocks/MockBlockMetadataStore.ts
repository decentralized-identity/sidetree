import BlockMetadata from '../../lib/bitcoin/models/BlockMetadata';
import IBlockMetadataStore from '../../lib/bitcoin/interfaces/IBlockMetadataStore';

export default class MockBlockMetadataStore implements IBlockMetadataStore {

    store: BlockMetadata[];
    constructor () {
      this.store = [];
    }

    public async add (blockMetadata: BlockMetadata[]): Promise<void> {
      this.store.push(...blockMetadata);
    }

    public async removeLaterThan (blockHeight?: number): Promise<void> {
      if (blockHeight !== undefined) {
        this.store = this.store.filter((block) => { return block.height < blockHeight; });
      }
    }

    public async get (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]> {
      const sortedStore = this.store.sort((a, b) => { return a.height - b.height; });
      return sortedStore.filter((block) => { return block.height >= fromInclusiveHeight && block.height < toExclusiveHeight; });
    }

    public async getLast (): Promise<BlockMetadata | undefined> {
      const sortedStore = this.store.sort((a, b) => { return a.height - b.height; });
      return sortedStore[sortedStore.length - 1];
    }

    public async lookBackExponentially (): Promise<BlockMetadata[]> {
      console.warn('lookBackExponentially always returns empty array. Use spy to override this.');
      return [];
    }
}
