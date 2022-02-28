import IConfirmationStore, { ConfirmationModel } from './interfaces/IConfirmationStore';
import MongoDbStore from '../common/MongoDbStore';

/**
 * Implementation of LastWriteStore that stores the last update per write
 */
export default class MongoDbConfirmationStore extends MongoDbStore implements IConfirmationStore {
  public static readonly collectionName: string = 'confirmations';

  constructor (serverUrl: string, databaseName: string) {
    super(serverUrl, MongoDbConfirmationStore.collectionName, databaseName);
  }

  public async confirm (anchorString: string, confirmedAt: number): Promise<void> {
    await this.collection.updateMany({ anchorString }, { $set: { confirmedAt } });
  }

  public async resetAfter (confirmedAt: number | undefined): Promise<void> {
    await this.collection.updateMany({ confirmedAt: { $gt: confirmedAt } }, { $set: { confirmedAt: undefined } });
  }

  public async getLastSubmitted (): Promise<ConfirmationModel | undefined> {
    const response: ConfirmationModel[] = await this.collection.find().sort({ submittedAt: -1 }).limit(1).toArray();
    if (response.length === 0) {
      return undefined;
    }

    // NOTE: MongoDB saves explicit `undefined` property as `null` internally by default,
    // so we do the `null` to `undefined` conversion here.
    if (response[0].confirmedAt === null) {
      response[0].confirmedAt = undefined;
    }

    return response[0];
  }

  public async submit (anchorString: string, submittedAt: number): Promise<void> {
    await this.collection.insertOne(
      {
        anchorString,
        submittedAt
      }
    );
  }

  /**
   * @inheritDoc
   */
  public async createIndex (): Promise<void> {
    await this.collection.createIndex({ anchorString: 1 });
    await this.collection.createIndex({ submittedAt: 1 });
    await this.collection.createIndex({ confirmedAt: 1 });
  }
}
