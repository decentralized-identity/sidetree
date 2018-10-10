/**
 * This enum contains all the config keys.
 */
export enum ConfigKey {
  BatchIntervalInSeconds = 'batchIntervalInSeconds',
  BlockchainNodeUri = 'BlockchainNodeUri',
  CasNodeUri = 'casNodeUri',
  DevMode = 'devMode', // Used to enable test hooks that are disabled in production.
  DidMethodName = 'didMethodName',
  Port = 'port'
}

/**
 * A map to look up the environment variable name given a config key.
 * Only add a new key-value mapping if the config value is a secret.
 */
const secretConfigKeyToEnvironmentVariableNameMap: { [configKey: string]: string } = {};
secretConfigKeyToEnvironmentVariableNameMap['secretConfigKey'] = 'SECRET_CONFIG_KEY'; // TODO: Remove this example once maps is used.

/**
 * The list of configuration settings used by the Sidetree server.
 */
export class Config {
  [configKey: string]: string;

  /**
   * Loads all the config key-value pairs from the given config file object.
   */
  public constructor (configFile: any) {
    for (const configKeyString in ConfigKey) {
      const configKey: ConfigKey = ConfigKey[configKeyString as keyof typeof ConfigKey];
      const configValue = Config.getValue(configFile, configKey);

      this[configKey] = configValue;
    }
  }

  /**
   * Gets the value of the given config key.
   * If a value is not a secret, it will always be read from given config file object.
   * If a value is a secret, then it will be read from the corresponding environment variable.
   * If unable to obtain the secret value from environment variable in production environment, an Error will be thrown.
   * If unable to obtain the secret value from environment variable in dev environment (devMode is set),
   *    the secret value will be read from the config file.
   */
  private static getValue (configFile: any, configKey: ConfigKey): string {
    const environmentVariableName = secretConfigKeyToEnvironmentVariableNameMap[configKey];

    if (environmentVariableName) {
      const configValue = process.env[environmentVariableName];

      if (configValue) {
        return configValue;
      } else {
        if (configFile[ConfigKey.DevMode]) {
          return configFile[configKey];
        } else {
          throw new Error(`Environment variable: ${environmentVariableName} not found. Set devMode config to 'true' if this is a dev machine.`);
        }
      }
    } else {
      return configFile[configKey];
    }
  }
}
