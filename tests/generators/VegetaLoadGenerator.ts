import * as fs from 'fs';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Did from '../../lib/core/versions/latest/Did';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import OperationGenerator from './OperationGenerator';
import Encoder from '../../lib/core/versions/latest/Encoder';

/**
 * Class for generating files used for load testing using Vegeta.
 */
export default class VegetaLoadGenerator {

  /**
   * Creates a Create request followed by an Update request for each DID.
   * Two targets files will be generated:
   *   One targets file containing all Create requests;
   *   One targest file containing all Update requests
   * @param uniqueDidCount The number of unique DID to be generated.
   * @param endpointUrl The URL that the requests will be sent to.
   * @param absoluteFolderPath The folder that all the generated files will be saved to.
   * @param hashAlgorithmInMultihashCode The hash algorithm in Multihash code in DEC (not in HEX).
   */
  public static async generateLoadFiles (uniqueDidCount: number, endpointUrl: string, absoluteFolderPath: string, hashAlgorithmInMultihashCode: number) {
    const keyId = '#key1';

    // Make directories needed by the request generator.
    fs.mkdirSync(absoluteFolderPath);
    fs.mkdirSync(absoluteFolderPath + '/keys');
    fs.mkdirSync(absoluteFolderPath + '/requests');

    for (let i = 0; i < uniqueDidCount; i++) {
      // Generate a random pair of public-private key pair and save them on disk.
      const [publicKey, privateKey] = await Cryptography.generateKeyPairHex(keyId, KeyUsage.recovery);
      fs.writeFileSync(absoluteFolderPath + `/keys/privateKey${i}.json`, JSON.stringify(privateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/publicKey${i}.json`, JSON.stringify(publicKey));

      const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
      const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);

      const [recover1OTP, recoveryOtpHash] = OperationGenerator.generateOtp();
      const [, recovery2OtpHash] = OperationGenerator.generateOtp();
      const [update1Otp, update1OtpHash] = OperationGenerator.generateOtp();
      const [, update2OtpHash] = OperationGenerator.generateOtp();

      // Generate the Create request body and save it on disk.
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        publicKey,
        privateKey,
        signingPublicKey,
        recoveryOtpHash,
        update1OtpHash,
        services
      );
      const createJson = JSON.parse(createOperationBuffer.toString());
      const createPayload = createJson.payload;
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationBuffer);

      // Compute the DID unique suffix from the generated Create payload.
      const didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(createPayload, hashAlgorithmInMultihashCode);
      const encodedDidDoc = JSON.parse(Encoder.decodeAsString(createPayload)).didDocument;

      // Generate an Update payload.
      const updatePayload = {
        didUniqueSuffix,
        patch: [{
          op: 'replace',
          path: '/publicKey/1',
          value: {
            id: 'key2',
            type: 'RsaVerificationKey2018',
            publicKeyPem: process.hrtime() // Some dummy value that's not used.
          }
        }],
        updateOtp: update1Otp,
        nextUpdateOtpHash: update2OtpHash
      };

      // Generate an Update request body and save it on disk.
      const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, keyId, privateKey);
      fs.writeFileSync(absoluteFolderPath + `/requests/update${i}.json`, updateOperationBuffer);

      // Generate a recovery payload.
      const recoveryPayload = {
        type: 'recover',
        didUniqueSuffix,
        recoveryOtp: recover1OTP,
        newDidDocument: encodedDidDoc,
        nextRecoveryOtpHash: recovery2OtpHash,
        nextUpdateOtpHash: update2OtpHash
      };
      const recoveryOperationBuffer = await OperationGenerator.createOperationBuffer(recoveryPayload, keyId, privateKey);
      fs.writeFileSync(`${absoluteFolderPath}/requests/recovery${i}.json`, recoveryOperationBuffer);
    }

    // Generate Create API calls in a targets file.
    let createTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      createTargetsFileString += `POST ${endpointUrl}\n`;
      createTargetsFileString += `@${absoluteFolderPath}/requests/create${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/createTargets.txt', createTargetsFileString);

    // Add Updtae API calls in a targets file.
    let updateTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      updateTargetsFileString += `POST ${endpointUrl}\n`;
      updateTargetsFileString += `@${absoluteFolderPath}/requests/update${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/updateTargets.txt', updateTargetsFileString);

    // Add Recovery API calls in a targets file.
    let recoveryTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      recoveryTargetsFileString += `POST ${endpointUrl}\n`;
      recoveryTargetsFileString += `@${absoluteFolderPath}/requests/recovery${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/recoveryTargets.txt', recoveryTargetsFileString);
  }
}
