import IConfirmationStore from './interfaces/IConfirmationStore';
import MongoDbStore from '../common/MongoDbStore';

interface ConfirmationModel {
  anchorString: string;
  submittedAt: number;
  confirmedAt: number | null;
}

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
    await this.collection.updateMany({ confirmedAt: { $gt: confirmedAt } }, { $set: { confirmedAt: null } });
  }

  public async getLastSubmitted (): Promise<{ submittedAt: number; confirmedAt: number | undefined } | undefined> {
    const response: ConfirmationModel[] = await this.collection.find().sort({ submittedAt: -1 }).limit(1).toArray();
    if (response.length === 0) {
      return undefined;
    }

    return {
      submittedAt: response[0].submittedAt,
      confirmedAt: response[0].confirmedAt === null ? undefined : response[0].confirmedAt
    };
  }

  public async submit (anchorString: string, submittedAt: number): Promise<void> {
    await this.collection.insertOne(
      {
        anchorString,
        submittedAt,
        confirmedAt: undefined
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
