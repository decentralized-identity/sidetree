import * as fs from 'fs';
import * as url from 'url';
import CreateOperation from '../../lib/core/versions/latest/CreateOperation';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import OperationGenerator from './OperationGenerator';
import Multihash from '../../lib/core/versions/latest/Multihash';

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
  public static async generateLoadFiles (uniqueDidCount: number, endpointUrl: string, absoluteFolderPath: string) {
    // Make directories needed by the request generator.
    fs.mkdirSync(absoluteFolderPath);
    fs.mkdirSync(absoluteFolderPath + '/keys');
    fs.mkdirSync(absoluteFolderPath + '/requests');

    for (let i = 0; i < uniqueDidCount; i++) {
      // Generate a random pair of public-private key pair and save them on disk.
      const [recoveryPublicKey, recoveryPrivateKey] = await Jwk.generateEs256kKeyPair();
      fs.writeFileSync(absoluteFolderPath + `/keys/recoveryPrivateKey${i}.json`, JSON.stringify(recoveryPrivateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/recoveryPublicKey${i}.json`, JSON.stringify(recoveryPublicKey));

      const signingKeyId = 'signingKey';
      const [signingPublicKey, signingPrivateKey] = await OperationGenerator.generateKeyPair(signingKeyId);
      fs.writeFileSync(absoluteFolderPath + `/keys/signingPrivateKey${i}.json`, JSON.stringify(recoveryPrivateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/signingPublicKey${i}.json`, JSON.stringify(recoveryPublicKey));
      const services = OperationGenerator.generateServiceEndpoints(['serviceEndpointId123']);

      // Generate the Create request body and save it on disk.
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        signingPublicKey,
        services
      );
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationBuffer);

      // Compute the DID unique suffix from the generated Create payload.
      const createOperation = await CreateOperation.parse(createOperationBuffer);
      const didUniqueSuffix = createOperation.didUniqueSuffix;
      const [newPublicKey] = await Jwk.generateEs256kKeyPair();
      const newUpdateCommitmentHash = Multihash.canonicalizeThenHashThenEncode(newPublicKey);

      // Generate an update operation
      const [additionalKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        didUniqueSuffix,
        signingPublicKey.jwk,
        additionalKey,
        newUpdateCommitmentHash,
        signingPrivateKey
      );

      // Save the update operation request on disk.
      const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      fs.writeFileSync(absoluteFolderPath + `/requests/update${i}.json`, updateOperationBuffer);

      // Generate a recover operation request.
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('newSigningKey');
      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        didUniqueSuffix, recoveryPrivateKey, newRecoveryPublicKey, newSigningPublicKey, newUpdateCommitmentHash
      );

      // Save the recover operation request on disk.
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      fs.writeFileSync(`${absoluteFolderPath}/requests/recovery${i}.json`, recoverOperationBuffer);
    }

    // Operations URL.
    const operationsUrl = url.resolve(endpointUrl, 'operations'); // e.g. http://localhost:3000/operations

    // Generate Create API calls in a targets file.
    let createTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      createTargetsFileString += `POST ${operationsUrl}\n`;
      createTargetsFileString += `@${absoluteFolderPath}/requests/create${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/createTargets.txt', createTargetsFileString);

    // Add Updtae API calls in a targets file.
    let updateTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      updateTargetsFileString += `POST ${operationsUrl}\n`;
      updateTargetsFileString += `@${absoluteFolderPath}/requests/update${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/updateTargets.txt', updateTargetsFileString);

    // Add Recovery API calls in a targets file.
    let recoveryTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      recoveryTargetsFileString += `POST ${operationsUrl}\n`;
      recoveryTargetsFileString += `@${absoluteFolderPath}/requests/recovery${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/recoveryTargets.txt', recoveryTargetsFileString);
  }
}
