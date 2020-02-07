import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';

describe('LockIdentifierSerializer', () => {

  describe('serialize', () => {
    it('should serialize and deserialize it correctly.', async () => {
      const identifier: LockIdentifier = {
        transactionId: 'some transaction id',
        redeemScriptAsHex: 'redeem script -- input',
        walletAddressAsBuffer: Buffer.from('some weird wallet address')
      };

      const serialized = LockIdentifierSerializer.serialize(identifier);
      expect(serialized).toBeDefined();

      const deserializedObj = LockIdentifierSerializer.fromSerialized(serialized);
      expect(deserializedObj).toEqual(identifier);
    });
  });

  describe('fromSerialized', () => {
    it('should throw if the input is not delimited correctly.', async () => {
      const delimiter = LockIdentifierSerializer['delimiter'];

      const incorrectInput = `value1${delimiter}value2${delimiter}value3`;

      JasmineSidetreeErrorValidator.expectBitcoinErrorToBeThrown(
        () => { LockIdentifierSerializer.fromSerialized(incorrectInput); },
        ErrorCode.LockIdentifierIncorrectFormat);
    });
  });
});
