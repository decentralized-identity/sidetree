import * as fs from 'fs';
import Cryptography from '../../src/lib/Cryptography';
import Did from '../../src/lib/Did';
import OperationGenerator from './OperationGenerator';
import { getProtocol } from '../../src/Protocol';

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
   * @param methodName The method name used to generate DIDs referenced in the update payload. e.g. 'did:sidetree:'
   * @param endpointUrl The URL that the requests will be sent to.
   * @param absoluteFolderPath The folder that all the generated files will be saved to.
   */
  public static async generateLoadFiles (uniqueDidCount: number, methodName: string, endpointUrl: string, absoluteFolderPath: string) {

    const didDocumentTemplate = require('../../../tests/json/didDocumentTemplate.json');
    const keyId = '#key1';

    // Make directories needed by the request generator.
    fs.mkdirSync(absoluteFolderPath);
    fs.mkdirSync(absoluteFolderPath + '/keys');
    fs.mkdirSync(absoluteFolderPath + '/requests');

    for (let i = 0; i < uniqueDidCount; i++) {
      // Generate a random pair of public-private key pair and save them on disk.
      const [publicKey, privateKey] = await Cryptography.generateKeyPairHex(keyId); // Generate a unique key-pair used for each test.
      fs.writeFileSync(absoluteFolderPath + `/keys/privateKey${i}.json`, JSON.stringify(privateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/publicKey${i}.json`, JSON.stringify(publicKey));

      // Generate the Create request body and save it on disk.
      const createOperationBuffer = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
      const createPayload = JSON.parse(createOperationBuffer.toString()).payload;
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationBuffer);

      // Compute the DID from the generated Create payload.
      const did = Did.from(createPayload, methodName, getProtocol(1000000).hashAlgorithmInMultihashCode);
      const didUniqueSuffix = Did.getUniqueSuffix(did);

      // Generate an Update payload.
      const updatePayload = {
        did,
        operationNumber: 1,
        previousOperationHash: didUniqueSuffix,
        patch: [{
          op: 'replace',
          path: '/publicKey/1',
          value: {
            id: 'key2',
            type: 'RsaVerificationKey2018',
            publicKeyPem: process.hrtime() // Some dummy value that's not used.
          }
        }]
      };

      // Generate an Update request body and save it on disk.
      const updateOperationBuffer = await OperationGenerator.generateUpdateOperation(updatePayload, keyId, privateKey);
      fs.writeFileSync(absoluteFolderPath + `/requests/update${i}.json`, updateOperationBuffer);
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
  }
}
