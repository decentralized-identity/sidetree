
import * as fs from 'fs';
import * as path from 'path';

export const writeFixtureToDisk = (filePath:string, fixture:any) => {
  fs.writeFileSync(path.resolve(__dirname, '../../tests/vectors/' + filePath), JSON.stringify(fixture, null, 2));
};

// this function should not be necessary if fixtures are well designed
// however, it is useful while they remain randomly generated.
export const fixtureDriftHelper = (received: any, expected: any, pathToFixture:string, overwrite:boolean = false) => {
  const match = JSON.stringify(received) === JSON.stringify(expected);
  if (!match) {
    // logger.error('Fixture Drift!');
    // logger.warn('Consider updating JSON to: ');
    // logger.warn(JSON.stringify(received, null, 2));
    if (overwrite) {
      writeFixtureToDisk(pathToFixture, received);
    }
  }
};
