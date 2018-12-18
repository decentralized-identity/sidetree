import * as fs from 'fs';

import OperationGenerator from './OperationGenerator';
import Did from '../../src/lib/Did';
import { getProtocol } from '../../src/Protocol';
import Cryptography from '../../src/lib/Cryptography';

/**
 * Class for generating files used for load testing using Vegeta.
 */
export default class VegetaLoadGenerator {

  /**
   * Creates a Create request followed by an Update request for each DID.
   */
  public static async generateCreateLoadFiles (uniqueDidCount: number, endpointUrl: string, absoluteFolderPath: string) {

    const didDocumentTemplate = require('../../../tests/json/didDocumentTemplate.json');

    // Make directories needed by the request generator.
    fs.mkdirSync(absoluteFolderPath);
    fs.mkdirSync(absoluteFolderPath + '/keys');
    fs.mkdirSync(absoluteFolderPath + '/requests');

    for (let i = 0; i < uniqueDidCount; i++) {
      // Generate a random pair of public-private key pair and save them on disk.
      const [publicKey, privateKey] = await Cryptography.generateKeyPair('key1'); // Generate a unique key-pair used for each test.
      fs.writeFileSync(absoluteFolderPath + `/keys/privateKey${i}.json`, JSON.stringify(privateKey));
      fs.writeFileSync(absoluteFolderPath + `/keys/publicKey${i}.json`, JSON.stringify(publicKey));

      // Generate the Create request body and save it on disk.
      const createOperationBuffer = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
      const createPayload = JSON.parse(createOperationBuffer.toString()).createPayload;
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationBuffer);

      // Compute the DID from the generated Create payload.
      const did = Did.from(createPayload, 'did:sidetree:', getProtocol(1000000).hashAlgorithmInMultihashCode);
      const didUniquePortion = Did.getUniquePortion(did);

      // Generate an Update payload.
      const updatePayload = {
        did,
        operationNumber: i + 1,
        previousOperationHash: didUniquePortion,
        patch: [{
          op: 'replace',
          path: '/publicKey/1',
          value: {
            id: 'key2',
            type: 'RsaVerificationKey2018',
            owner: 'did:sidetree:dummydid',
            publicKeyPem: process.hrtime() // Some dummy value that's not used.
          }
        }]
      };

      // Generate an Update request body and save it on disk.
      const updateOperationBuffer = await OperationGenerator.generateUpdateOperation(updatePayload, privateKey);
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
