import * as flatbuffers from 'flatbuffers';
export declare class HeightmapSolverOptions implements flatbuffers.IUnpackableObject<HeightmapSolverOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): HeightmapSolverOptions;
    static getRootAsHeightmapSolverOptions(bb: flatbuffers.ByteBuffer, obj?: HeightmapSolverOptions): HeightmapSolverOptions;
    static getSizePrefixedRootAsHeightmapSolverOptions(bb: flatbuffers.ByteBuffer, obj?: HeightmapSolverOptions): HeightmapSolverOptions;
    maxBoxes(): number | null;
    allowRotation(): boolean;
    minSupport(): number | null;
    cellSize(): number | null;
    restarts(): number | null;
    seed(): number | null;
    strictUnsupported(): boolean | null;
    static startHeightmapSolverOptions(builder: flatbuffers.Builder): void;
    static addMaxBoxes(builder: flatbuffers.Builder, maxBoxes: number): void;
    static addAllowRotation(builder: flatbuffers.Builder, allowRotation: boolean): void;
    static addMinSupport(builder: flatbuffers.Builder, minSupport: number): void;
    static addCellSize(builder: flatbuffers.Builder, cellSize: number): void;
    static addRestarts(builder: flatbuffers.Builder, restarts: number): void;
    static addSeed(builder: flatbuffers.Builder, seed: number): void;
    static addStrictUnsupported(builder: flatbuffers.Builder, strictUnsupported: boolean): void;
    static endHeightmapSolverOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createHeightmapSolverOptions(builder: flatbuffers.Builder, maxBoxes: number | null, allowRotation: boolean, minSupport: number | null, cellSize: number | null, restarts: number | null, seed: number | null, strictUnsupported: boolean | null): flatbuffers.Offset;
    unpack(): HeightmapSolverOptionsT;
    unpackTo(_o: HeightmapSolverOptionsT): void;
}
export declare class HeightmapSolverOptionsT implements flatbuffers.IGeneratedObject {
    maxBoxes: number | null;
    allowRotation: boolean;
    minSupport: number | null;
    cellSize: number | null;
    restarts: number | null;
    seed: number | null;
    strictUnsupported: boolean | null;
    constructor(maxBoxes?: number | null, allowRotation?: boolean, minSupport?: number | null, cellSize?: number | null, restarts?: number | null, seed?: number | null, strictUnsupported?: boolean | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=heightmap-solver-options.d.ts.map