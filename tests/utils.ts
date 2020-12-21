
import * as fs from 'fs';
import * as path from 'path';

import DocumentModel from '../lib/core/versions/latest/models/DocumentModel';
import PublicKeyModel from '../lib/core/versions/latest/models/PublicKeyModel';

export const writeFixtureToDisk = (filePath:string, fixture:any) => {
  fs.writeFileSync(path.resolve(__dirname, '../../tests/vectors/' + filePath), JSON.stringify(fixture, null, 2));
};

// this function should not be necessary if fixtures are well designed
// however, it is useful while they remain randomly generated.
export const fixtureDriftHelper = (received: any, expected: any, pathToFixture:string, overwrite:boolean = false) => {
  const match = JSON.stringify(received) === JSON.stringify(expected);
  if (!match) {
    // console.error('Fixture Drift!');
    // console.warn('Consider updating JSON to: ');
    // console.warn(JSON.stringify(received, null, 2));
    if (overwrite) {
      writeFixtureToDisk(pathToFixture, received);
    }
  }
};

export const getPublicKey = (document: DocumentModel, keyId: string): PublicKeyModel | undefined => {
  if (Array.isArray(document.publicKeys)) {
    for (let i = 0; i < document.publicKeys.length; i++) {
      const publicKey = document.publicKeys[i];

      if (publicKey.id === keyId) {
        return publicKey;
      }
    }
  }
  return undefined;
};
