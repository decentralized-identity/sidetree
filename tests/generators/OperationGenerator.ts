import DidPublicKey from '../../src/lib/DidPublicKey';
import Encoder from '../../src/Encoder';
import { IOperation, Operation } from '../../src/Operation';
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
  public static async generateCreateOperation (didDocumentTemplate: any, publicKey: DidPublicKey, privateKey: string | PrivateKey): Promise<IOperation> {
    // Replace the placeholder public-key with the public-key given.
    didDocumentTemplate.publicKey[0] = publicKey;

    // Create the create payload.
    const didDocumentJson = JSON.stringify(didDocumentTemplate);
    const createPayload = Encoder.encode(didDocumentJson);

    // Generate the signature.
    const signature = await Operation.sign(createPayload, privateKey);

    const operation = {
      header: {
        operation: 'create',
        kid: publicKey.id,
        alg: 'ES256K',
        proofOfWork: {}
      },
      payload: createPayload,
      signature
    };

    return operation;
  }

  /**
   * Creates a Create Operation buffer with valid signature.
   * @param didDocumentTemplate A DID Document used as the template. Must contain at least one public-key.
   */
  public static async generateCreateOperationBuffer (didDocumentTemplate: any, publicKey: DidPublicKey, privateKey: string | PrivateKey): Promise<Buffer> {
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
  public static async generateUpdateOperation (updatePayload: object, keyId: string, privateKey: string | PrivateKey): Promise<IOperation> {
    // Encode Update payload.
    const updatePayloadJson = JSON.stringify(updatePayload);
    const updatePayloadEncoded = Encoder.encode(updatePayloadJson);

    // Generate the signature.
    const signature = await Operation.sign(updatePayloadEncoded, privateKey);

    const operation = {
      header: {
        operation: 'update',
        kid: keyId,
        alg: 'ES256K',
        proofOfWork: {}
      },
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
  public static async generateDeleteOperation (didUniqueSuffix: string, keyId: string, privateKey: string | PrivateKey): Promise<IOperation> {
    const payload = { didUniqueSuffix };

    // Encode payload.
    const payloadJson = JSON.stringify(payload);
    const payloadEncoded = Encoder.encode(payloadJson);

    const signature = await Operation.sign(payloadEncoded, privateKey);

    const operation = {
      header: {
        operation: 'delete',
        kid: keyId,
        alg: 'ES256K',
        proofOfWork: {}
      },
      payload: payloadEncoded,
      signature
    };

    return operation;
  }
}
