import * as flatbuffers from 'flatbuffers';
import { ExtremePointOptionsT } from '../fbs/extreme-point-options.js';
import { GreedyOptionsT } from '../fbs/greedy-options.js';
import { PHPSolverOptionsT } from '../fbs/phpsolver-options.js';
import { ShitStackOptionsT } from '../fbs/shit-stack-options.js';
import { SolveStrategyOptions } from '../fbs/solve-strategy-options.js';
export declare class SolveOptions implements flatbuffers.IUnpackableObject<SolveOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): SolveOptions;
    static getRootAsSolveOptions(bb: flatbuffers.ByteBuffer, obj?: SolveOptions): SolveOptions;
    static getSizePrefixedRootAsSolveOptions(bb: flatbuffers.ByteBuffer, obj?: SolveOptions): SolveOptions;
    maxBoxes(): number | null;
    allowRotation(): boolean;
    timeoutMs(): number | null;
    algoOptionsType(): SolveStrategyOptions;
    algoOptions<T extends flatbuffers.Table>(obj: any): any | null;
    static startSolveOptions(builder: flatbuffers.Builder): void;
    static addMaxBoxes(builder: flatbuffers.Builder, maxBoxes: number): void;
    static addAllowRotation(builder: flatbuffers.Builder, allowRotation: boolean): void;
    static addTimeoutMs(builder: flatbuffers.Builder, timeoutMs: number): void;
    static addAlgoOptionsType(builder: flatbuffers.Builder, algoOptionsType: SolveStrategyOptions): void;
    static addAlgoOptions(builder: flatbuffers.Builder, algoOptionsOffset: flatbuffers.Offset): void;
    static endSolveOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createSolveOptions(builder: flatbuffers.Builder, maxBoxes: number | null, allowRotation: boolean, timeoutMs: number | null, algoOptionsType: SolveStrategyOptions, algoOptionsOffset: flatbuffers.Offset): flatbuffers.Offset;
    unpack(): SolveOptionsT;
    unpackTo(_o: SolveOptionsT): void;
}
export declare class SolveOptionsT implements flatbuffers.IGeneratedObject {
    maxBoxes: number | null;
    allowRotation: boolean;
    timeoutMs: number | null;
    algoOptionsType: SolveStrategyOptions;
    algoOptions: ExtremePointOptionsT | GreedyOptionsT | PHPSolverOptionsT | ShitStackOptionsT | null;
    constructor(maxBoxes?: number | null, allowRotation?: boolean, timeoutMs?: number | null, algoOptionsType?: SolveStrategyOptions, algoOptions?: ExtremePointOptionsT | GreedyOptionsT | PHPSolverOptionsT | ShitStackOptionsT | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-options.d.ts.map