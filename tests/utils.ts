
import * as fs from 'fs';
import * as path from 'path';

export const writeFixtureToDisk = (filePath:string, fixture:any) => {
  fs.writeFileSync(path.resolve(__dirname, '../../tests/vectors/' + filePath), JSON.stringify(fixture, null, 2));
};

// this funtion should not be necessary if fixtures are well designed
// however, it is useful while they remain randomly generated.
export const fixtureDriftHelper = (recieved: any, expected: any, pathToFixture:string, overwrite:boolean = false) => {
  const match = JSON.stringify(recieved) === JSON.stringify(expected);
  if (!match) {
    // console.error('Fixture Drift!');
    // console.warn('Consider updating JSON to: ');
    // console.warn(JSON.stringify(recieved, null, 2));
    if (overwrite) {
      writeFixtureToDisk(pathToFixture, recieved);
    }
  }
};
