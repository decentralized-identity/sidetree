export interface ConfirmationModel {
  anchorString: string;
  submittedAt: number;
  confirmedAt: number | undefined;
}

export default interface IConfirmationStore {
  getLastSubmitted (): Promise<ConfirmationModel | undefined>;
  submit (anchorString: string, submittedAt: number): Promise<void>;
  confirm (anchorString: string, confirmedAt: number): Promise<void>;
  resetAfter (confirmedAt: number | undefined): Promise<void>;
}
