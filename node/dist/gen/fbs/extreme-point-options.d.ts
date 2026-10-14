import * as flatbuffers from 'flatbuffers';
export declare class ExtremePointOptions implements flatbuffers.IUnpackableObject<ExtremePointOptionsT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): ExtremePointOptions;
    static getRootAsExtremePointOptions(bb: flatbuffers.ByteBuffer, obj?: ExtremePointOptions): ExtremePointOptions;
    static getSizePrefixedRootAsExtremePointOptions(bb: flatbuffers.ByteBuffer, obj?: ExtremePointOptions): ExtremePointOptions;
    volumePreference(): number | null;
    weightPreference(): number | null;
    static startExtremePointOptions(builder: flatbuffers.Builder): void;
    static addVolumePreference(builder: flatbuffers.Builder, volumePreference: number): void;
    static addWeightPreference(builder: flatbuffers.Builder, weightPreference: number): void;
    static endExtremePointOptions(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createExtremePointOptions(builder: flatbuffers.Builder, volumePreference: number | null, weightPreference: number | null): flatbuffers.Offset;
    unpack(): ExtremePointOptionsT;
    unpackTo(_o: ExtremePointOptionsT): void;
}
export declare class ExtremePointOptionsT implements flatbuffers.IGeneratedObject {
    volumePreference: number | null;
    weightPreference: number | null;
    constructor(volumePreference?: number | null, weightPreference?: number | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=extreme-point-options.d.ts.map