import { Collection, Db, LoggerState, MongoClient } from 'mongodb';
import Logger from '../common/Logger';

/**
 * Base class that contains the common MongoDB collection setup.
 */
export default class MongoDbStore {

  public static readonly defaultQueryTimeoutInMilliseconds = 10000;

  /** MondoDB instance. */
  protected db: Db | undefined;
  /** MongoDB collection */
  protected collection!: Collection<any>;

  /**
   * Set the logger for mongodb command monitoring.
   * @param client the mongodb client
   */
  public static enableCommandResultLogging (client: MongoClient) {
    client.on('commandSucceeded', (event: any) => {
      // Command name can have different casing in different MongoDB versions, so always compare lower case.
      const lowerCaseCommandName = (event.commandName as string).toLowerCase();
      if (!['ping', 'hello', 'ismaster', 'hostinfo'].includes(lowerCaseCommandName)) {
        Logger.info(event);
      }
    });
    client.on('commandFailed', (event: any) => {
      Logger.warn(event);
    });
  }

  /**
   * The custom logger for general logging purpose in mongodb client
   * @param _message The message is already included in the state so there is no need to log the message twice.
   * @param state The complete logging event state
   */
  public static customLogger (_message: string | undefined, state: LoggerState | undefined): void {
    if (state === undefined) {
      return;
    }

    switch (state.type) {
      case 'error':
        Logger.error(state);
        break;
      default:
        Logger.info(state);
    }
  };

  /**
   * Constructs a `MongoDbStore`;
   */
  constructor (private serverUrl: string, private collectionName: string, private databaseName: string) { }

  /**
   * Initialize the MongoDB transaction store.
   */
  public async initialize (): Promise<void> {
    // `useNewUrlParser` addresses nodejs's URL parser deprecation warning.
    const client = await MongoClient.connect(this.serverUrl, {
      useNewUrlParser: true,
      logger: MongoDbStore.customLogger,
      monitorCommands: true,
      loggerLevel: 'error'
    });
    MongoDbStore.enableCommandResultLogging(client);
    this.db = client.db(this.databaseName);
    await this.createCollectionIfNotExist(this.db);
  }

  /**
   * Clears the store.
   * NOTE: Avoid dropping collection using `collection.drop()` and recreating the collection in rapid succession (such as in tests), because:
   * 1. It takes some time (seconds) for the collection be created again.
   * 2. Some cloud MongoDB services such as CosmosDB will lead to `MongoError: ns not found` connectivity error.
   */
  public async clearCollection () {
    await this.collection.deleteMany({ }); // Empty filter removes all entries in collection.
  }

  /**
   * Creates the collection with indexes if it does not exists.
   */
  private async createCollectionIfNotExist (db: Db): Promise<void> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If collection exists, use it; else create it.
    if (collectionNames.includes(this.collectionName)) {
      Logger.info(`Collection '${this.collectionName}' found.`);
      this.collection = db.collection(this.collectionName);
    } else {
      Logger.info(`Collection '${this.collectionName}' does not exists, creating...`);
      this.collection = await db.createCollection(this.collectionName);

      await this.createIndex();
      Logger.info(`Collection '${this.collectionName}' created.`);
    }
  }

  /**
   * Create the indices required by this store.
   * To be overridden by inherited classes if a collection index is needed.
   */
  public async createIndex (): Promise<void> {
  }
}
