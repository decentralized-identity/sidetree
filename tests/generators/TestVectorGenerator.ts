import * as fs from 'fs';
import Jwk from "../../lib/core/versions/latest/util/Jwk";
import Multihash from "../../lib/core/versions/latest/Multihash";
import OperationGenerator from "./OperationGenerator";

export default class TestVectorGenerator {
  /**
     * Generate and prints out test vectors for operation requests
     */
  public static async generateOperationVectors(writeToDisc?: boolean, saveLocation?: string) {

    // generate a create operation request
    const createOperationData = await OperationGenerator.generateCreateOperation();

    // derive an update operation request from the create
    const [nextUpdateKey] = await OperationGenerator.generateKeyPair('nextUpdateKey');
    const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.publicKeyJwk);
    const [anyNewSigningKey] = await OperationGenerator.generateKeyPair('newKeyId');
    const patches = [
      {
        action: 'add-public-keys',
        publicKeys: [
          anyNewSigningKey
        ]
      }
    ];
    const updateRequest = await OperationGenerator.createUpdateOperationRequest(
      createOperationData.createOperation.didUniqueSuffix,
      createOperationData.updatePublicKey,
      createOperationData.updatePrivateKey,
      nextUpdateCommitmentHash,
      patches
    )

    // derive a recover operation from the create operation
    const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
    const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('keyAfterRecover');

    const [documentKey] = await OperationGenerator.generateKeyPair('newDocumentKey');
    const newServices = OperationGenerator.generateServices(['newId']);

    const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
      createOperationData.createOperation.didUniqueSuffix,
      createOperationData.recoveryPrivateKey,
      newRecoveryPublicKey,
      newSigningPublicKey,
      newServices,
      [documentKey]
    );

    const deactivateRequest = await OperationGenerator.createDeactivateOperationRequest(createOperationData.createOperation.didUniqueSuffix, createOperationData.recoveryPrivateKey);


    const createRequestString = JSON.stringify(createOperationData.operationRequest, null, 2);
    const updateRequestString = JSON.stringify(updateRequest, null, 2);
    const recoverRequestString = JSON.stringify(recoverOperationRequest, null, 2);
    const deactivateRequestString = JSON.stringify(deactivateRequest);

    if (writeToDisc && saveLocation) {
      fs.writeFileSync(`${saveLocation}/create.json`, createRequestString);
      fs.writeFileSync(`${saveLocation}/update.json`, updateRequestString);
      fs.writeFileSync(`${saveLocation}/recover.json`, recoverRequestString);
      fs.writeFileSync(`${saveLocation}/deactivate.json`, deactivateRequestString);
    } else {
      console.log(createRequestString);
      console.log(updateRequestString);
      console.log(recoverRequestString);
      console.log(deactivateRequestString);
    }
  }
}