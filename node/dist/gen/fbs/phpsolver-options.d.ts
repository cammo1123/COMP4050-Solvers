import * as flatbuffers from 'flatbuffers';
export declare class PHPSolverOptions implements flatbuffers.IUnpackableObject<PHPSolverOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): PHPSolverOptions;
    static getRootAsPHPSolverOptions(bb: flatbuffers.ByteBuffer, obj?: PHPSolverOptions): PHPSolverOptions;
    static getSizePrefixedRootAsPHPSolverOptions(bb: flatbuffers.ByteBuffer, obj?: PHPSolverOptions): PHPSolverOptions;
    balanceWeight(): boolean | null;
    allPermutations(): boolean | null;
    singleBox(): boolean | null;
    strictItemOrder(): boolean | null;
    bestSubset(): boolean | null;
    maxBoxes(): number | null;
    allowRotation(): boolean;
    static startPHPSolverOptions(builder: flatbuffers.Builder): void;
    static addBalanceWeight(builder: flatbuffers.Builder, balanceWeight: boolean): void;
    static addAllPermutations(builder: flatbuffers.Builder, allPermutations: boolean): void;
    static addSingleBox(builder: flatbuffers.Builder, singleBox: boolean): void;
    static addStrictItemOrder(builder: flatbuffers.Builder, strictItemOrder: boolean): void;
    static addBestSubset(builder: flatbuffers.Builder, bestSubset: boolean): void;
    static addMaxBoxes(builder: flatbuffers.Builder, maxBoxes: number): void;
    static addAllowRotation(builder: flatbuffers.Builder, allowRotation: boolean): void;
    static endPHPSolverOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createPHPSolverOptions(builder: flatbuffers.Builder, balanceWeight: boolean | null, allPermutations: boolean | null, singleBox: boolean | null, strictItemOrder: boolean | null, bestSubset: boolean | null, maxBoxes: number | null, allowRotation: boolean): flatbuffers.Offset;
    unpack(): PHPSolverOptionsT;
    unpackTo(_o: PHPSolverOptionsT): void;
}
export declare class PHPSolverOptionsT implements flatbuffers.IGeneratedObject {
    balanceWeight: boolean | null;
    allPermutations: boolean | null;
    singleBox: boolean | null;
    strictItemOrder: boolean | null;
    bestSubset: boolean | null;
    maxBoxes: number | null;
    allowRotation: boolean;
    constructor(balanceWeight?: boolean | null, allPermutations?: boolean | null, singleBox?: boolean | null, strictItemOrder?: boolean | null, bestSubset?: boolean | null, maxBoxes?: number | null, allowRotation?: boolean);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=phpsolver-options.d.ts.map