export default interface IConfirmationStore {
  getLastSubmitted (): Promise<{submittedAt: number, confirmedAt: number | null} | undefined>;
  submit (anchorString: string, submittedAt: number): Promise<void>;
  confirm (anchorString: string, confirmedAt: number | null): Promise<void>;
}
