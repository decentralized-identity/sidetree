
import * as fs from 'fs';
import * as path from 'path';

export default class Fixture {
  private static writeFixtureToDisk (filePath:string, fixture:any): void {
    fs.writeFileSync(path.resolve(__dirname, '../../tests/vectors/' + filePath), JSON.stringify(fixture, null, 2));
  };

  // this function should not be necessary if fixtures are well designed
  // however, it is useful while they remain randomly generated.
  public static fixtureDriftHelper (received: any, expected: any, pathToFixture:string, overwrite:boolean = false): void {
    const match = JSON.stringify(received) === JSON.stringify(expected);
    if (!match) {
      // console.error('Fixture Drift!');
      // console.warn('Consider updating JSON to: ');
      // console.warn(JSON.stringify(received, null, 2));
      if (overwrite) {
        Fixture.writeFixtureToDisk(pathToFixture, received);
      }
    }
  }
}
