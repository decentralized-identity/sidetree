import * as fs from 'fs';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from './OperationGenerator';

/**
 * Class for generating files used for load testing using Vegeta.
 */
export default class VegetaLoadGenerator {

  /**
   * Creates a Create request followed by an Update request for each DID.
   * Following targets files will be generated:
   *   One targets file containing all Create requests
   *   One targets file containing all Update requests
   *   One targets file containing all recovery requests
   *   One targets file containing all deactivate requests
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
      const createOperationData = await OperationGenerator.generateCreateOperation();

      // Generate a random pair of public-private key pair and save them on disk.
      fs.writeFileSync(absoluteFolderPath + `/keys/recoveryPrivateKey${i}.json`, JSON.stringify(createOperationData.recoveryPrivateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/recoveryPublicKey${i}.json`, JSON.stringify(createOperationData.recoveryPublicKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/updatePrivateKey${i}.json`, JSON.stringify(createOperationData.updatePrivateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/updatePublicKey${i}.json`, JSON.stringify(createOperationData.updatePublicKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/signingPrivateKey${i}.json`, JSON.stringify(createOperationData.signingPrivateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/signingPublicKey${i}.json`, JSON.stringify(createOperationData.signingPublicKey));

      // Save the create operation request on disk.
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationData.createOperation.operationBuffer);

      const [newUpdatePublicKey] = await Jwk.generateEs256kKeyPair();
      const newUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(newUpdatePublicKey);

      // Generate an update operation
      const [additionalKey] = await OperationGenerator.generateKeyPair(`additionalKey`);
      const updateOperationRequest = await OperationGenerator.createUpdateOperationRequestForAddingAKey(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.updatePublicKey,
        createOperationData.updatePrivateKey,
        additionalKey,
        newUpdateCommitmentHash
      );

      // Save the update operation request on disk.
      const updateOperationBuffer = Buffer.from(JSON.stringify(updateOperationRequest));
      fs.writeFileSync(absoluteFolderPath + `/requests/update${i}.json`, updateOperationBuffer);

      // Generate a recover operation request.
      const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
      const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('newSigningKey');
      const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
        createOperationData.createOperation.didUniqueSuffix,
        createOperationData.recoveryPrivateKey,
        newRecoveryPublicKey,
        newSigningPublicKey,
        OperationGenerator.generateServices(['newDummyEndpoint']),
        [newSigningPublicKey]
      );

      // Save the recover operation request on disk.
      const recoverOperationBuffer = Buffer.from(JSON.stringify(recoverOperationRequest));
      fs.writeFileSync(`${absoluteFolderPath}/requests/recovery${i}.json`, recoverOperationBuffer);

      // Generate a deactivate operation request.
      // NOTE: generated deactivate operation request is mutually exclusive with the recover operation counter part,
      // ie. one can only choose to submit either recovery or deactivate request but not both.
      const deactivateOperationRequest = await OperationGenerator.createDeactivateOperationRequest(
        createOperationData.createOperation.didUniqueSuffix, createOperationData.recoveryPrivateKey
      );

      // Save the deactivate operation request on disk.
      const deactivateOperationBuffer = Buffer.from(JSON.stringify(deactivateOperationRequest));
      fs.writeFileSync(`${absoluteFolderPath}/requests/deactivate${i}.json`, deactivateOperationBuffer);
    }

    // Operations URL.
    const operationsUrl = new URL('operations', endpointUrl).toString(); // e.g. http://localhost:3000/operations

    // Generate Create API calls in a targets file.
    let createTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      createTargetsFileString += `POST ${operationsUrl}\n`;
      createTargetsFileString += `@${absoluteFolderPath}/requests/create${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/createTargets.txt', createTargetsFileString);

    // Add Update API calls in a targets file.
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

    // Add Deactivate API calls in a targets file.
    let deactivateTargetsFileString = '';
    for (let i = 0; i < uniqueDidCount; i++) {
      deactivateTargetsFileString += `POST ${operationsUrl}\n`;
      deactivateTargetsFileString += `@${absoluteFolderPath}/requests/deactivate${i}.json\n\n`;
    }
    fs.writeFileSync(absoluteFolderPath + '/deactivateTargets.txt', deactivateTargetsFileString);
  }
}
