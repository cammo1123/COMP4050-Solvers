import * as flatbuffers from 'flatbuffers';
export declare class GuillotineSolverOptions implements flatbuffers.IUnpackableObject<GuillotineSolverOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): GuillotineSolverOptions;
    static getRootAsGuillotineSolverOptions(bb: flatbuffers.ByteBuffer, obj?: GuillotineSolverOptions): GuillotineSolverOptions;
    static getSizePrefixedRootAsGuillotineSolverOptions(bb: flatbuffers.ByteBuffer, obj?: GuillotineSolverOptions): GuillotineSolverOptions;
    allowRotation(): boolean;
    comboThreshold(): number | null;
    combos(): number | null;
    heavyOnBottom(): boolean | null;
    maxBoxes(): number | null;
    minSupport(): number | null;
    restarts(): number | null;
    seed(): number | null;
    strictUnsupported(): boolean | null;
    static startGuillotineSolverOptions(builder: flatbuffers.Builder): void;
    static addAllowRotation(builder: flatbuffers.Builder, allowRotation: boolean): void;
    static addComboThreshold(builder: flatbuffers.Builder, comboThreshold: number): void;
    static addCombos(builder: flatbuffers.Builder, combos: number): void;
    static addHeavyOnBottom(builder: flatbuffers.Builder, heavyOnBottom: boolean): void;
    static addMaxBoxes(builder: flatbuffers.Builder, maxBoxes: number): void;
    static addMinSupport(builder: flatbuffers.Builder, minSupport: number): void;
    static addRestarts(builder: flatbuffers.Builder, restarts: number): void;
    static addSeed(builder: flatbuffers.Builder, seed: number): void;
    static addStrictUnsupported(builder: flatbuffers.Builder, strictUnsupported: boolean): void;
    static endGuillotineSolverOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createGuillotineSolverOptions(builder: flatbuffers.Builder, allowRotation: boolean, comboThreshold: number | null, combos: number | null, heavyOnBottom: boolean | null, maxBoxes: number | null, minSupport: number | null, restarts: number | null, seed: number | null, strictUnsupported: boolean | null): flatbuffers.Offset;
    unpack(): GuillotineSolverOptionsT;
    unpackTo(_o: GuillotineSolverOptionsT): void;
}
export declare class GuillotineSolverOptionsT implements flatbuffers.IGeneratedObject {
    allowRotation: boolean;
    comboThreshold: number | null;
    combos: number | null;
    heavyOnBottom: boolean | null;
    maxBoxes: number | null;
    minSupport: number | null;
    restarts: number | null;
    seed: number | null;
    strictUnsupported: boolean | null;
    constructor(allowRotation?: boolean, comboThreshold?: number | null, combos?: number | null, heavyOnBottom?: boolean | null, maxBoxes?: number | null, minSupport?: number | null, restarts?: number | null, seed?: number | null, strictUnsupported?: boolean | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=guillotine-solver-options.d.ts.map