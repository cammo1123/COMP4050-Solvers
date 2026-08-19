import * as flatbuffers from 'flatbuffers';
export declare class SolveOptions implements flatbuffers.IUnpackableObject<SolveOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): SolveOptions;
    static getRootAsSolveOptions(bb: flatbuffers.ByteBuffer, obj?: SolveOptions): SolveOptions;
    static getSizePrefixedRootAsSolveOptions(bb: flatbuffers.ByteBuffer, obj?: SolveOptions): SolveOptions;
    maxBoxes(): number | null;
    allowRotation(): boolean;
    timeoutMs(): number | null;
    strategy(): number | null;
    balanceWeight(): boolean | null;
    allPermutations(): boolean | null;
    singleBox(): boolean | null;
    static startSolveOptions(builder: flatbuffers.Builder): void;
    static addMaxBoxes(builder: flatbuffers.Builder, maxBoxes: number): void;
    static addAllowRotation(builder: flatbuffers.Builder, allowRotation: boolean): void;
    static addTimeoutMs(builder: flatbuffers.Builder, timeoutMs: number): void;
    static addStrategy(builder: flatbuffers.Builder, strategy: number): void;
    static addBalanceWeight(builder: flatbuffers.Builder, balanceWeight: boolean): void;
    static addAllPermutations(builder: flatbuffers.Builder, allPermutations: boolean): void;
    static addSingleBox(builder: flatbuffers.Builder, singleBox: boolean): void;
    static endSolveOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createSolveOptions(builder: flatbuffers.Builder, maxBoxes: number | null, allowRotation: boolean, timeoutMs: number | null, strategy: number | null, balanceWeight: boolean | null, allPermutations: boolean | null, singleBox: boolean | null): flatbuffers.Offset;
    unpack(): SolveOptionsT;
    unpackTo(_o: SolveOptionsT): void;
}
export declare class SolveOptionsT implements flatbuffers.IGeneratedObject {
    maxBoxes: number | null;
    allowRotation: boolean;
    timeoutMs: number | null;
    strategy: number | null;
    balanceWeight: boolean | null;
    allPermutations: boolean | null;
    singleBox: boolean | null;
    constructor(maxBoxes?: number | null, allowRotation?: boolean, timeoutMs?: number | null, strategy?: number | null, balanceWeight?: boolean | null, allPermutations?: boolean | null, singleBox?: boolean | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=solve-options.d.ts.map