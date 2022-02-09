export default interface IConfirmationStore {
  getLastSubmitted (): Promise<{submittedAt: number, confirmedAt: number | undefined} | undefined>;
  submit (anchorString: string, submittedAt: number): Promise<void>;
  confirm (anchorString: string, confirmedAt: number | undefined): Promise<void>;
}
