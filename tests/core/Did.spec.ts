import * as crypto from 'crypto';
import Did from '../../lib/core/versions/latest/Did';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import JsonCanonicalizer from '../../lib/core/versions/latest/util/JsonCanonicalizer';
import OperationGenerator from '../generators/OperationGenerator';
import SidetreeError from '../../lib/common/SidetreeError';

describe('DID', async () => {
  describe('constructCreateOperationFromEncodedJCS', () => {
    it('should throw sidetree error if initial state is not an json', () => {
      const testInitialState = Encoder.encode('notJson');
      try {
        Did['constructCreateOperationFromEncodedJcs'](testInitialState);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.DidInitialStateJcsIsNotJson, 'Long form initial state should be encoded jcs.'));
      }
    });

    it('should throw sidetree error if initial state is not jcs', () => {
      const testInitialState = Encoder.encode(JSON.stringify({ z: 1, a: 2, b: 1 }));
      try {
        Did['constructCreateOperationFromEncodedJcs'](testInitialState);
        fail('expect to throw sidetree error but did not');
      } catch (e) {
        expect(e).toEqual(new SidetreeError(ErrorCode.DidInitialStateJcsIsNotJcs, 'Initial state object and JCS string mismatch.'));
      }
    });

    it('should throw sidetree error if delta exceeds size limit', () => {
      const largeData = crypto.randomBytes(2000).toString('hex');// Intentionally exceeding max size.
      const largeDelta = { data: largeData };
      const testInitialState = Encoder.encode(JsonCanonicalizer.canonicalizeAsBuffer({ suffixData: 'some data', delta: largeDelta }));

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(() => {
        Did['constructCreateOperationFromEncodedJcs'](testInitialState);
      }, ErrorCode.DeltaExceedsMaximumSize);
    });
  });

  describe('create()', async () => {
    it('should create a short-form DID successfully.', async () => {
      const expectedDidMethodName = 'sidetree';
      const uniqueSuffix = 'abcdefg';
      const didString = `did:${expectedDidMethodName}:${uniqueSuffix}`;
      const did = await Did.create(didString, expectedDidMethodName);
      expect(did.didMethodName).toEqual(expectedDidMethodName);
      expect(did.createOperation).toBeUndefined();
      expect(did.isShortForm).toBeTruthy();
      expect(did.shortForm).toEqual(didString);
      expect(did.uniqueSuffix).toEqual(uniqueSuffix);
    });

    it('should create a long-form DID with suffix data and delta successfully.', async () => {
      // Create a long-form DID string.

      const generatedLongFormDidData = await OperationGenerator.generateLongFormDid();
      const didMethodName = 'sidetree';

      const did = await Did.create(generatedLongFormDidData.longFormDid, didMethodName);
      expect(did.isShortForm).toBeFalsy();
      expect(did.didMethodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(generatedLongFormDidData.shortFormDid);
      expect(did.uniqueSuffix).toEqual(generatedLongFormDidData.didUniqueSuffix);
    });

    it('should create a testnet long-form DID with suffix data and delta successfully.', async () => {
      // Create a long-form DID string.
      const generatedLongFormDidData = await OperationGenerator.generateLongFormDid(undefined, undefined, 'testnet');
      const didMethodName = 'sidetree:testnet';

      const did = await Did.create(generatedLongFormDidData.longFormDid, didMethodName);
      expect(did.isShortForm).toBeFalsy();
      expect(did.didMethodName).toEqual(didMethodName);
      expect(did.shortForm).toEqual(generatedLongFormDidData.shortFormDid);
      expect(did.uniqueSuffix).toEqual(generatedLongFormDidData.didUniqueSuffix);
    });

    it('should throw if DID given does not match the expected DID method name.', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg', 'sidetree2'),
        ErrorCode.DidIncorrectPrefix
      );
    });

    it('should throw if DID given does not contain unique suffix.', async () => {
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create('did:sidetree:', 'sidetree'),
        ErrorCode.DidNoUniqueSuffix
      );
    });

    it('should throw if encoded DID document in long-form DID given results in a mismatching short-form DID.', async () => {
      let longFormDid = (await OperationGenerator.generateLongFormDid()).longFormDid;

      // [did, method, suffix, inistalState]
      const longFormDidParts = longFormDid.split(':');
      longFormDidParts[2] = 'EiA_MismatchingDID_AAAAAAAAAAAAAAAAAAAAAAAAAAA';
      longFormDid = longFormDidParts.join(':');

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Did.create(longFormDid, 'sidetree'),
        ErrorCode.DidUniqueSuffixFromInitialStateMismatch
      );
    });
  });
});
