import Jwk from "../../lib/core/versions/latest/util/Jwk";
import Multihash from "../../lib/core/versions/latest/Multihash";
import OperationGenerator from "./OperationGenerator";

export default class TestVectorGenerator {
    /**
     * Generate and prints out test vectors for operation requests
     */
    public static async generateOperationVectors() {

        // generate a create operation request
        const createOperationData = await OperationGenerator.generateCreateOperation();

        // derive an update operation request from the create
        const [nextUpdateKey] = await OperationGenerator.generateKeyPair('nextUpdateKey');
        const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.jwk);
        const [anyNewSigningKey] = await OperationGenerator.generateKeyPair('newKeyId');
        const patches = [
          {
            action: 'add-public-keys',
            public_keys: [
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
        const newServiceEndpoints = OperationGenerator.generateServiceEndpoints(['newId']);
  
        const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
          createOperationData.createOperation.didUniqueSuffix,
          createOperationData.recoveryPrivateKey,
          newRecoveryPublicKey,
          newSigningPublicKey,
          newServiceEndpoints,
          [documentKey]
        );
  
  
        console.log(JSON.stringify(createOperationData.operationRequest));
        console.log(JSON.stringify(updateRequest));
        console.log(JSON.stringify(recoverOperationRequest))
    }
}