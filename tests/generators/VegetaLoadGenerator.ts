import * as fs from 'fs';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import Did from '../../lib/core/versions/latest/Did';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import OperationGenerator from './OperationGenerator';

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
    const didDocumentTemplate = require('../json/didDocumentTemplate.json');
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

      // Generate the Create request body and save it on disk.
      const createOperationBuffer = await OperationGenerator.generateCreateOperationBuffer(didDocumentTemplate, publicKey, privateKey);
      const createPayload = JSON.parse(createOperationBuffer.toString()).payload;
      fs.writeFileSync(absoluteFolderPath + `/requests/create${i}.json`, createOperationBuffer);

      // Compute the DID unique suffix from the generated Create payload.
      const didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(createPayload, hashAlgorithmInMultihashCode);

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
        }]
      };

      // Generate an Update request body and save it on disk.
      const updateOperationBuffer = await OperationGenerator.generateUpdateOperationBuffer(updatePayload, keyId, privateKey);
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
