/**
 * A simple in-memory implementation of operation store.
 */
import IConfirmationStore, { ConfirmationModel } from '../../lib/core/interfaces/IConfirmationStore';

export default class MockConfirmationStore implements IConfirmationStore {
  private entries: ConfirmationModel[] = [];
  public clear () : void{
    this.entries = [];
  }

  public async confirm (anchorString: string, confirmedAt: number): Promise<void> {
    const found = this.entries.find(entry => entry.anchorString === anchorString);
    if (found !== undefined) {
      found.confirmedAt = confirmedAt;
    }
  }

  public async getLastSubmitted (): Promise<ConfirmationModel | undefined> {
    const sorted = this.entries.sort((a, b) => b.submittedAt - a.submittedAt);
    if (sorted.length === 0) {
      return undefined;
    } else {
      return sorted[0];
    }
  }

  public async submit (anchorString: string, submittedAt: number): Promise<void> {
    this.entries.push({
      anchorString,
      submittedAt,
      confirmedAt: undefined
    });
  }

  public async resetAfter (confirmedAt: number | undefined): Promise<void> {
    this.entries.forEach((entry) => {
      if (confirmedAt === undefined || (entry.confirmedAt && entry.confirmedAt > confirmedAt)) {
        entry.confirmedAt = undefined;
      }
    });
  }
}
