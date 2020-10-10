import * as fs from 'fs';
import * as path from 'path';
import OperationGenerator from '../generators/OperationGenerator';

const OVERWITE_TEST_VECTORS = false;

describe('Test Vectors', () => {
  let fixture:any = {};
  let createOperationData:any;
  let updateOperationData:any;
  let recoverOperationData:any;
  let deactivateOperationData:any;

  it('can generate create', async () => {
    createOperationData = await OperationGenerator.generateCreateOperation();
    const fixtureData = { ...createOperationData } as any;
    delete fixtureData.createOperation.operationBuffer;
    const dids = await OperationGenerator.longFormFromCreateOperationData(createOperationData);
    fixture = {
      ...fixture,
      create: {
        ...dids,
        ...fixtureData
      }
    };
    // here is where you would assert that
    // no breaking changes have occured for create operations
    // if test vector generation was deterministic
  });

  it('can generate update', async () => {
    updateOperationData = await OperationGenerator.generateUpdateOperation(
      createOperationData.createOperation.didUniqueSuffix,
      createOperationData.updatePublicKey,
      createOperationData.updatePrivateKey
    );
    const fixtureData = { ...updateOperationData } as any;
    delete fixtureData.updateOperation.operationBuffer;
    delete fixtureData.operationBuffer;
    fixture = {
      ...fixture,
      update: fixtureData
    };
    // here is where you would assert that
    // no breaking changes have occured for update operations
    // if test vector generation was deterministic
  });

  it('can generate recover', async () => {
    const input = {
      didUniqueSuffix: createOperationData.createOperation.didUniqueSuffix,
      recoveryPrivateKey: createOperationData.recoveryPrivateKey
    };
    recoverOperationData = await OperationGenerator.generateRecoverOperation(input);
    const fixtureData = { ...recoverOperationData } as any;
    delete fixtureData.recoverOperation.operationBuffer;
    delete fixtureData.operationBuffer;
    fixture = {
      ...fixture,
      recover: fixtureData
    };
    // here is where you would assert that
    // no breaking changes have occured for recover operations
    // if test vector generation was deterministic
  });

  it('can generate deactivate', async () => {
    deactivateOperationData = await OperationGenerator.createDeactivateOperation(
      createOperationData.createOperation.didUniqueSuffix,
      recoverOperationData.recoveryPrivateKey
    );
    const fixtureData = { ...deactivateOperationData } as any;
    delete fixtureData.deactivateOperation.operationBuffer;
    delete fixtureData.operationBuffer;
    fixture = {
      ...fixture,
      deactivate: fixtureData
    };
    // here is where you would assert that
    // no breaking changes have occured for deactivate operations
    // if test vector generation was deterministic
  });

  it('should write fixture to disk', async () => {
    if (OVERWITE_TEST_VECTORS) {
      fs.writeFileSync(path.resolve(__dirname, '../../../tests/vectors/generated.json'), JSON.stringify(fixture, null, 2));
    }
  });
});
