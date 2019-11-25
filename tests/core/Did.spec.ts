import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Did from '../../lib/core/versions/latest/Did';
import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Multihash from '../../lib/core/versions/latest/Multihash';

describe('DID', async () => {
  describe('create()', async () => {
    it('should create a short-form DID succssefully.', async () => {
      const expectedDidMethodName = 'did:sidetree:';
      const uniqueSuffix = 'abcdefg';
      const didString = expectedDidMethodName + uniqueSuffix;
      const did = Did.create(didString, expectedDidMethodName);
      expect(did.didMethodName).toEqual(expectedDidMethodName);
      expect(did.encodedDidDocument).toBeUndefined();
      expect(did.isShortForm).toBeTruthy();
      expect(did.shortForm).toEqual(didString);
      expect(did.uniqueSuffix).toEqual(uniqueSuffix);
    });

    it('should create a long-form DID succssefully.', async () => {
      // Create an original DID Document.
      const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.signing);
      const originalDidDocument = {
        '@context': 'https://w3id.org/did/v1',
        publicKey: [recoveryPublicKey, signingPublicKey]
      };
      const encodedOriginalDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
      const hashAlgorithmInMultihashCode = 18;
      const documentHash = Multihash.hash(Buffer.from(encodedOriginalDidDocument), hashAlgorithmInMultihashCode);
      const expectedDidMethodName = 'did:sidetree:';
      const longFormDid = Did.createLongFormDidString(expectedDidMethodName, originalDidDocument, hashAlgorithmInMultihashCode);
      const did = Did.create(longFormDid, expectedDidMethodName);

      const expectedEncodedDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
      const expectedUniqueSuffix = Encoder.encode(documentHash);
      const expectedShortFormDid = expectedDidMethodName + expectedUniqueSuffix;
      expect(did.didMethodName).toEqual(expectedDidMethodName);
      expect(did.encodedDidDocument).toEqual(expectedEncodedDidDocument);
      expect(did.isShortForm).toBeFalsy();
      expect(did.shortForm).toEqual(expectedShortFormDid);
      expect(did.uniqueSuffix).toEqual(expectedUniqueSuffix);
    });

    it('should throw if DID given does not match the expected DID method name.', async () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Did.create('did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg', 'did:sidetree2:'),
        ErrorCode.DidIncorrectPrefix
      );
    });

    it('should throw if DID given does not contain unique suffix.', async () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Did.create('did:sidetree:', 'did:sidetree:'),
        ErrorCode.DidNoUniqueSuffix
      );
    });

    it('should throw if encoded DID document in long-form DID given results in a mismatching short-form DID.', async () => {
      // Create an original DID Document.
      let recoveryPublicKey: DidPublicKeyModel;
      let signingPublicKey: DidPublicKeyModel;
      [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
      [signingPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.signing);
      const originalDidDocument = {
        '@context': 'https://w3id.org/did/v1',
        publicKey: [recoveryPublicKey, signingPublicKey]
      };
      const encodedOriginalDidDocument = Encoder.encode(JSON.stringify(originalDidDocument));
      const mismatchingShortFormDid = 'did:sidetree:EiAgE-q5cRcn4JHh8ETJGKqaJv1z2OgjmN3N-APx0aAvHg';
      const longFormDid = `${mismatchingShortFormDid};initial-values=${encodedOriginalDidDocument}`;

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Did.create(longFormDid, 'did:sidetree:'),
        ErrorCode.DidEncodedDidDocumentHashMismatch
      );
    });
  });
});
