import IVersionManager from "../../lib/core/interfaces/IVersionManager";
import IBatchWriter from "../../lib/core/interfaces/IBatchWriter";
import IOperationProcessor from "../../lib/core/interfaces/IOperationProcessor";
import IRequestHandler from "../../lib/core/interfaces/IRequestHandler";
import ITransactionProcessor from "../../lib/core/interfaces/ITransactionProcessor";
export default class MockVersionManager implements IVersionManager {
    public constructor() { }
    public getBatchWriter(blockchainTime: number): IBatchWriter {
        throw new Error("Not implemented. Use spyOn to override the funcationality. Input: " + blockchainTime);
    }
    public getOperationProcessor(blockchainTime: number): IOperationProcessor {
        throw new Error("Not implemented. Use spyOn to override the funcationality. Input: " + blockchainTime);
    }
    public getRequestHandler(blockchainTime: number): IRequestHandler {
        throw new Error("Not implemented. Use spyOn to override the funcationality. Input: " + blockchainTime);
    }
    public getTransactionProcessor(blockchainTime: number): ITransactionProcessor {
        throw new Error("Not implemented. Use spyOn to override the funcationality. Input: " + blockchainTime);
    }
}
