import * as flatbuffers from 'flatbuffers';
export declare class BoxType implements flatbuffers.IUnpackableObject<BoxTypeT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): BoxType;
    static getRootAsBoxType(bb: flatbuffers.ByteBuffer, obj?: BoxType): BoxType;
    static getSizePrefixedRootAsBoxType(bb: flatbuffers.ByteBuffer, obj?: BoxType): BoxType;
    reference(): string | null;
    reference(optionalEncoding: flatbuffers.Encoding): string | Uint8Array | null;
    width(): number;
    length(): number;
    depth(): number;
    maxWeight(): number | null;
    boxWeight(): number | null;
    active(): boolean | null;
    maximumBoxes(): number | null;
    outerWidth(): number | null;
    outerLength(): number | null;
    outerDepth(): number | null;
    static startBoxType(builder: flatbuffers.Builder): void;
    static addReference(builder: flatbuffers.Builder, referenceOffset: flatbuffers.Offset): void;
    static addWidth(builder: flatbuffers.Builder, width: number): void;
    static addLength(builder: flatbuffers.Builder, length: number): void;
    static addDepth(builder: flatbuffers.Builder, depth: number): void;
    static addMaxWeight(builder: flatbuffers.Builder, maxWeight: number): void;
    static addBoxWeight(builder: flatbuffers.Builder, boxWeight: number): void;
    static addActive(builder: flatbuffers.Builder, active: boolean): void;
    static addMaximumBoxes(builder: flatbuffers.Builder, maximumBoxes: number): void;
    static addOuterWidth(builder: flatbuffers.Builder, outerWidth: number): void;
    static addOuterLength(builder: flatbuffers.Builder, outerLength: number): void;
    static addOuterDepth(builder: flatbuffers.Builder, outerDepth: number): void;
    static endBoxType(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createBoxType(builder: flatbuffers.Builder, referenceOffset: flatbuffers.Offset, width: number, length: number, depth: number, maxWeight: number | null, boxWeight: number | null, active: boolean | null, maximumBoxes: number | null, outerWidth: number | null, outerLength: number | null, outerDepth: number | null): flatbuffers.Offset;
    unpack(): BoxTypeT;
    unpackTo(_o: BoxTypeT): void;
}
export declare class BoxTypeT implements flatbuffers.IGeneratedObject {
    reference: string | Uint8Array | null;
    width: number;
    length: number;
    depth: number;
    maxWeight: number | null;
    boxWeight: number | null;
    active: boolean | null;
    maximumBoxes: number | null;
    outerWidth: number | null;
    outerLength: number | null;
    outerDepth: number | null;
    constructor(reference?: string | Uint8Array | null, width?: number, length?: number, depth?: number, maxWeight?: number | null, boxWeight?: number | null, active?: boolean | null, maximumBoxes?: number | null, outerWidth?: number | null, outerLength?: number | null, outerDepth?: number | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=box-type.d.ts.map