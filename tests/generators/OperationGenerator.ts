import DidPublicKeyModel from '../../lib/core/versions/latest/models/DidPublicKeyModel';
import Encoder from '../../lib/core/versions/latest/Encoder';
import Jws from '../../lib/core/versions/latest/util/Jws';
import JwsModel from '../../lib/core/versions/latest/models/JwsModel';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

/**
 * A class that can generate valid operations.
 * Mainly useful for testing purposes.
 */
export default class OperationGenerator {

  /**
   * Creates a Create Operation with valid signature.
   * @param didDocumentTemplate A DID Document used as the template. Must contain at least one public-key.
   */
  public static async generateCreateOperation (
    didDocumentTemplate: any,
    publicKey: DidPublicKeyModel,
    privateKey: string | PrivateKey
  ): Promise<JwsModel> {

    // Replace the placeholder public-key with the public-key given.
    didDocumentTemplate.publicKey[0] = publicKey;

    // Create the encoded protected header.
    const protectedHeader = {
      operation: 'create',
      kid: publicKey.id,
      alg: 'ES256K'
    };
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);

    // Create the create payload.
    const didDocumentJson = JSON.stringify(didDocumentTemplate);
    const createPayload = Encoder.encode(didDocumentJson);

    // Generate the signature.
    const signature = await Jws.sign(protectedHeaderEncodedString, createPayload, privateKey);

    const operation = {
      protected: protectedHeaderEncodedString,
      payload: createPayload,
      signature
    };

    return operation;
  }

  /**
   * Creates a Create Operation buffer with valid signature.
   * @param didDocumentTemplate A DID Document used as the template. Must contain at least one public-key.
   */
  public static async generateCreateOperationBuffer (didDocumentTemplate: any, publicKey: DidPublicKeyModel, privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates an Update Operation buffer with valid signature.
   */
  public static async generateUpdateOperationBuffer (updatePayload: object, keyId: string, privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateUpdateOperation(updatePayload, keyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates an Update Operation buffer with valid signature.
   */
  public static async generateUpdateOperation (updatePayload: object, keyId: string, privateKey: string | PrivateKey): Promise<JwsModel> {
    // Create the encoded protected header.
    const protectedHeader = {
      operation: 'update',
      kid: keyId,
      alg: 'ES256K'
    };
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);

    // Encode Update payload.
    const updatePayloadJson = JSON.stringify(updatePayload);
    const updatePayloadEncoded = Encoder.encode(updatePayloadJson);

    // Generate the signature.
    const signature = await Jws.sign(protectedHeaderEncodedString, updatePayloadEncoded, privateKey);

    const operation = {
      protected: protectedHeaderEncodedString,
      payload: updatePayloadEncoded,
      signature
    };

    return operation;
  }

  /**
   * Generates a Delete Operation buffer.
   */
  public static async generateDeleteOperationBuffer (didUniqueSuffix: string, keyId: string, privateKey: string | PrivateKey): Promise<Buffer> {
    const operation = await OperationGenerator.generateDeleteOperation(didUniqueSuffix, keyId, privateKey);
    return Buffer.from(JSON.stringify(operation));
  }

  /**
   * Generates a Delete Operation.
   */
  public static async generateDeleteOperation (didUniqueSuffix: string, keyId: string, privateKey: string | PrivateKey): Promise<JwsModel> {
    // Create the encoded protected header.
    const protectedHeader = {
      operation: 'delete',
      kid: keyId,
      alg: 'ES256K'
    };
    const protectedHeaderJsonString = JSON.stringify(protectedHeader);
    const protectedHeaderEncodedString = Encoder.encode(protectedHeaderJsonString);

    // Encode payload.
    const payload = { didUniqueSuffix };
    const payloadJson = JSON.stringify(payload);
    const payloadEncoded = Encoder.encode(payloadJson);

    const signature = await Jws.sign(protectedHeaderEncodedString, payloadEncoded, privateKey);

    const operation = {
      protected: protectedHeaderEncodedString,
      payload: payloadEncoded,
      signature
    };

    return operation;
  }
}
