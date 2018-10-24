import { Config, ConfigKey } from '../src/Config';

describe('Conifg', () => {

  it('should load secrets from environment variables.', () => {
    const configFile = require('../json/config.json');
    const secretValue = 'abc';
    process.env.EXAMPLE_SECRET = secretValue;

    const config = new Config(configFile);
    const actualSecretValue = config[ConfigKey.ExampleSecret];

    expect(actualSecretValue).toEqual(secretValue);
  });

  it('should throw error if secrets cannot be loaded from environment variables in production environment.', () => {
    const configFile = require('../json/config.json');
    configFile.devMode = false;
    delete process.env.EXAMPLE_SECRET;

    expect(() => {
      const config = new Config(configFile);
      console.log(config); // Added to suppress no-unused-expression rule. Code should never reach here unless test fails.
    }).toThrowError();
  });
});
