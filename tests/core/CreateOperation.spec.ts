import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
import OperationType from '../../lib/core/enums/OperationType';
import SidetreeError from '../../lib/core/SidetreeError';

describe('CreateOperation', async () => {
  describe('parse()', async () => {
    it('should throw create operation request has more than 3 properties.', async () => {
      const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
      const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
      const [, recoveryOtpHash] = OperationGenerator.generateOtp();
      const [, firstUpdateOtpHash] = OperationGenerator.generateOtp();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        recoveryOtpHash,
        firstUpdateOtpHash,
        services
      );

      (createOperationRequest as any).extraProperty = 'unknown extra property';

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty));
    });

    it('should throw if operation type is incorrect', async () => {
      const [recoveryPublicKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
      const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);
      const [, recoveryOtpHash] = OperationGenerator.generateOtp();
      const [, firstUpdateOtpHash] = OperationGenerator.generateOtp();
      const createOperationRequest = await OperationGenerator.generateCreateOperationRequest(
        recoveryPublicKey,
        signingPublicKey,
        recoveryOtpHash,
        firstUpdateOtpHash,
        services
      );

      createOperationRequest.type = OperationType.Delete;

      const createOperationBuffer = Buffer.from(JSON.stringify(createOperationRequest));
      await expectAsync(CreateOperation.parse(createOperationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationTypeIncorrect));
    });
  });

  describe('parseSuffixData()', async () => {
    it('should throw if suffix data is not string', async () => {
      await expectAsync((CreateOperation as any).parseSuffixData(123))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrNotString));
    });

    it('should throw if suffix data contains an additional unknown property.', async () => {
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryKey: { publicKeyHex: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
        nextRecoveryOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty));
    });

    it('should throw if suffix data is missing recovery key.', async () => {
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        // recoveryKey: { publicKeyHex: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, // Intentionally missing.
        nextRecoveryOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationRecoveryKeyMissing));
    });

    it('should throw if suffix data has invalid recovery key.', async () => {
      const suffixData = {
        operationDataHash: Encoder.encode(Multihash.hash(Buffer.from('some data'))),
        recoveryKey: { knownKeyType: 123 },
        nextRecoveryOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password')))
      };
      const encodedSuffixData = Encoder.encode(JSON.stringify(suffixData));
      await expectAsync((CreateOperation as any).parseSuffixData(encodedSuffixData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationRecoveryKeyInvalid));
    });
  });

  describe('parseOperationData()', async () => {
    it('should throw if operation data is not string', async () => {
      await expectAsync((CreateOperation as any).parseOperationData(123)).toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationDataMissingOrNotString));
    });

    it('should throw if operation data contains an additional unknown property.', async () => {
      const operationData = {
        document: 'any opaque content',
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        extraProperty: 'An unknown extra property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((CreateOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationDataMissingOrUnknownProperty));
    });

    it('should throw if operation data is missing document property.', async () => {
      const operationData = {
        // document: 'any opaque content', // Intentionally missing.
        nextUpdateOtpHash: Encoder.encode(Multihash.hash(Buffer.from('some one time password'))),
        unknownProperty: 'An unknown property'
      };
      const encodedOperationData = Encoder.encode(JSON.stringify(operationData));
      await expectAsync((CreateOperation as any).parseOperationData(encodedOperationData))
        .toBeRejectedWith(new SidetreeError(ErrorCode.CreateOperationDocumentMissing));
    });
  });
});
