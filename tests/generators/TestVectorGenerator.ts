import * as fs from 'fs';
import * as jwkEs256k1Private from '../vectors/inputs/jwkEs256k1Private.json';
import * as jwkEs256k1Public from '../vectors/inputs/jwkEs256k1Public.json';
import * as jwkEs256k2Private from '../vectors/inputs/jwkEs256k2Private.json';
import * as jwkEs256k2Public from '../vectors/inputs/jwkEs256k2Public.json';
import * as path from 'path';
import * as publicKeyModel1 from '../vectors/inputs/publicKeyModel1.json';
import * as service1 from '../vectors/inputs/service1.json';
import Jwk from '../../lib/core/versions/latest/util/Jwk';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from './OperationGenerator';
import PatchAction from '../../lib/core/versions/latest/PatchAction';

const saveLocation = path.resolve(__dirname, '../../../tests/vectors/inputs');
fs.mkdirSync(saveLocation, { recursive: true });

(async () => {
  // generate a create operation request
  const recoveryPublicKey = jwkEs256k1Public;
  const recoveryPrivateKey = jwkEs256k1Private;
  const updatePublicKey = jwkEs256k2Public;
  const updatePrivateKey = jwkEs256k2Private;
  const otherKeys = [publicKeyModel1 as any];
  const services = [service1];
  const createOperationRequest = await OperationGenerator.createCreateOperationRequest(recoveryPublicKey, updatePublicKey, otherKeys, services);
  const did = await OperationGenerator.createDid(recoveryPublicKey, updatePublicKey, createOperationRequest.delta.patches);

  // derive an update operation request from the create
  const [nextUpdateKey] = await OperationGenerator.generateKeyPair('nextUpdateKey');
  const nextUpdateCommitmentHash = Multihash.canonicalizeThenDoubleHashThenEncode(nextUpdateKey.publicKeyJwk);
  const [anyNewSigningKey] = await OperationGenerator.generateKeyPair('newKeyId');
  const patches = [
    {
      action: PatchAction.AddPublicKeys,
      publicKeys: [
        anyNewSigningKey
      ]
    }
  ];
  const updateRequest = await OperationGenerator.createUpdateOperationRequest(
    did.didUniqueSuffix,
    updatePublicKey,
    updatePrivateKey,
    nextUpdateCommitmentHash,
    patches
  );

  // derive a recover operation from the create operation
  const [newRecoveryPublicKey] = await Jwk.generateEs256kKeyPair();
  const [newSigningPublicKey] = await OperationGenerator.generateKeyPair('keyAfterRecover');

  const [documentKey] = await OperationGenerator.generateKeyPair('newDocumentKey');
  const newServices = OperationGenerator.generateServices(['newId']);

  const recoverOperationRequest = await OperationGenerator.generateRecoverOperationRequest(
    did.didUniqueSuffix,
    recoveryPrivateKey,
    newRecoveryPublicKey,
    newSigningPublicKey,
    newServices,
    [documentKey]
  );

  const deactivateRequest = await OperationGenerator.createDeactivateOperationRequest(did.didUniqueSuffix, recoveryPrivateKey);

  const createRequestString = JSON.stringify(createOperationRequest, null, 2);
  const updateRequestString = JSON.stringify(updateRequest, null, 2);
  const recoverRequestString = JSON.stringify(recoverOperationRequest, null, 2);
  const deactivateRequestString = JSON.stringify(deactivateRequest);

  fs.writeFileSync(`${saveLocation}/create.json`, createRequestString);
  fs.writeFileSync(`${saveLocation}/update.json`, updateRequestString);
  fs.writeFileSync(`${saveLocation}/recover.json`, recoverRequestString);
  fs.writeFileSync(`${saveLocation}/deactivate.json`, deactivateRequestString);
})();
