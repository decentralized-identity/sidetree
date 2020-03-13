import BlockDataFileDecoder from '../../lib/bitcoin/BlockDataFileDecoder';

describe('BlockDataFileDecoder', () => {
  describe('decode', () => {
    it('should decode right number of blocks on mainnet', () => {
      // 1 block of mainnet data
      // tslint:disable-next-line: max-line-length
      const fileBuf = Buffer.from('f9beb4d91d0100000100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000', 'hex');
      const result = BlockDataFileDecoder.decode(fileBuf);
      expect(result.length).toEqual(1);
    });

    it('should decode the right number of blocks on testnet', () => {
      // 1 block of testnet data
      // tslint:disable-next-line: max-line-length
      const fileBuf = Buffer.from('0b1109071d0100000100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c0101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000', 'hex');
      const result = BlockDataFileDecoder.decode(fileBuf);
      expect(result.length).toEqual(1);
    });

    it('should return no block data if neither on main nor testnet', () => {
      const fileBuf = Buffer.from('someRandomString');
      const result = BlockDataFileDecoder.decode(fileBuf);
      expect(result.length).toEqual(0);
    });
  });

  describe('getTransactionHex', () => {
    it('should process transactions without witnesses', () => {
      // tslint:disable-next-line: max-line-length
      const transaction = '02000000011c063ecf8b7e1f43d8d3d0fffb47b3d2a9503ed851121e96cc1e85f54c1be0c1010000006a47304402203efda90cebb732eb511573482a8ae4d876ce25d951fb61f6ec4a78525a35833002204964eaf3056afca880c95574ae7d089be59b1e3396e864e63aa857aa58e1fa520121033bf49f80965fbac7065a97a6999d2b485643c431ebe63e2e884aec55128a1781fdffffff0195ab40020000000017a914458ac121b9cf238ea401b6ec48965c92deabbf5c87277b0900';
      const result = BlockDataFileDecoder['getTransactionHexes'](transaction, 1);
      expect(result).toEqual([[transaction], '']);
    })

    it('should process bip144 transaction', () => {
      // tslint:disable-next-line: max-line-length
      const bip144Transaction = '010000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff5403587b091b4d696e656420627920416e74506f6f6c383920001500208fed9588fabe6d6d79c996dfe409eda4ac294e21fa7256063a06cc82950c948e7559cd1d2c3404c20400000000000000f9dd0100f40c0000ffffffff03fa454b4d000000001976a91411dbe48cc6b617f9c6adaf4d9ed5f625b1c7cb5988ac0000000000000000266a24aa21a9ed92c477958696271c5124ea63fc35667dfb45186e8cfc27aa768ab9d4be2fb06c0000000000000000266a24b9e11b6df7e810a03805250cd6a845767ae4393b1fdf1618501ae7058d28e702f4c3965c0120000000000000000000000000000000000000000000000000000000000000000000000000';
      const result = BlockDataFileDecoder['getTransactionHexes'](bip144Transaction, 1);
      expect(result).toEqual([[bip144Transaction], '']);
    });
  });

  describe('parseVarInt', () => {
    it('should parse with no prefix', () => {
      const hex = '00random';
      const result = BlockDataFileDecoder['parseVarInt'](hex);
      expect(result).toEqual([0, 'random', '00']);
    });

    it('should parse with prefix fd', () => {
      const hex = 'fdffffrandom';
      const result = BlockDataFileDecoder['parseVarInt'](hex);
      expect(result).toEqual([65535, 'random', 'fdffff']);
    });

    it('should parse with prefix fe', () => {
      const hex = 'feffffffffrandom';
      const result = BlockDataFileDecoder['parseVarInt'](hex);
      expect(result).toEqual([4294967295, 'random', 'feffffffff']);
    });

    it('should parse with prefix ff', () => {
      const hex = 'ffffffffffffffffffrandom';
      const result = BlockDataFileDecoder['parseVarInt'](hex);
      expect(result).toEqual([18446744073709552000, 'random', 'ffffffffffffffffff']);
    });
  });
});
