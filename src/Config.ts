const configFile = require('./config.json');

/**
 * The list of configuration settings used by the Sidetree server.
 */
export interface Config {
  readonly [configKey: string]: string;
}

/**
 * This enum contains all the config keys.
 */
export enum ConfigKey {
  Port = 'port',
  CasNodeUri = 'casNodeUri',
  BlockchainNodeUri = 'BlockchainNodeUri',

  BatchIntervalInSeconds = 'batchIntervalInSeconds'
}

/**
 * A map to look up the environment variable name given a config key.
 * Only add a new key-value mapping if the config value is a secret.
 */
const secretConfigKeyToEnvironmentVariableNameMap: { [configKey: string]: string } = {};
secretConfigKeyToEnvironmentVariableNameMap['secretConfigKey'] = 'SECRET_CONFIG_KEY'; // TODO: Remove this example once maps is used.

/**
 * Gets the value of the given config key.
 * If a value is not a secret, it will always be read from config file.
 * If a value is a secret, then it will be read from the corresponding environment variable.
 * If unable to obtain the secret value from environment variable in production environment, an Error will be thrown.
 * If unable to obtain the secret value from environment variable in dev environment (DEV_MODE is set),
 * the secret value will be read from the config file.
 */
function getValue (configKey: ConfigKey): string {
  const environmentVariableName = secretConfigKeyToEnvironmentVariableNameMap[configKey];

  if (environmentVariableName) {
    const configValue = process.env[environmentVariableName];

    if (configValue) {
      return configValue;
    } else {
      if (process.env.DEV_MODE) {
        return configFile[configKey];
      } else {
        throw new Error(`Environment variable: ${environmentVariableName} not found. Set DEV_MODE environement variable to 1 if this is a dev machine.`);
      }
    }
  } else {
    return configFile[configKey];
  }
}

/**
 * Loads all the config key-value pairs.
 */
function loadConfig (): Config {
  const config: { [configKey: string]: string } = {};

  for (const configKeyString in ConfigKey) {
    const configKey: ConfigKey = ConfigKey[configKeyString as keyof typeof ConfigKey];
    const configValue = getValue(configKey);

    config[configKey] = configValue;
  }

  return config;
}

const config: Config = loadConfig();
export { config };
