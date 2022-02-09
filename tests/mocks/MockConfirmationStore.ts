/**
 * A simple in-memory implementation of operation store.
 */
import IConfirmationStore from '../../lib/core/interfaces/IConfirmationStore';

interface ConfirmationModel {
  anchorString: string;
  submittedAt: number;
  confirmedAt: number | undefined;
}

export default class MockConfirmationStore implements IConfirmationStore {
  private readonly entries: ConfirmationModel[] = [];
  public async confirm (anchorString: string, confirmedAt: number | undefined): Promise<void> {
    const found = this.entries.find(entry => entry.anchorString === anchorString);
    if (found !== undefined) {
      found.confirmedAt = confirmedAt;
    }
  }

  public async getLastSubmitted (): Promise<{ submittedAt: number; confirmedAt: number | undefined } | undefined> {
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
}
