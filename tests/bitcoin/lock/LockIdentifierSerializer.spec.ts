import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../../JasmineSidetreeErrorValidator';
import LockIdentifier from '../../../lib/bitcoin/models/LockIdentifierModel';
import LockIdentifierSerializer from '../../../lib/bitcoin/lock/LockIdentifierSerializer';
import base64url from 'base64url';

describe('LockIdentifierSerializer', () => {

  describe('serialize', () => {
    it('should serialize and deserialize it correctly.', async () => {
      const identifier: LockIdentifier = {
        transactionId: 'some transaction id',
        redeemScriptAsHex: 'redeem script -- input'
      };

      const serialized = LockIdentifierSerializer.serialize(identifier);
      expect(serialized).toBeDefined();

      const deserializedObj = LockIdentifierSerializer.deserialize(serialized);
      expect(deserializedObj).toEqual(identifier);
    });
  });

  describe('deserialize', () => {
    it('should throw if the input is not delimited correctly.', async () => {
      const delimiter = LockIdentifierSerializer['delimiter'];

      const incorrectInput = `value1${delimiter}value2${delimiter}value3`;
      const incorrectInputEncoded = base64url.encode(incorrectInput);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { LockIdentifierSerializer.deserialize(incorrectInputEncoded); },
        ErrorCode.LockIdentifierIncorrectFormat);
    });
  });
});
