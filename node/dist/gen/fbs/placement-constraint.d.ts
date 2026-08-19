import * as flatbuffers from 'flatbuffers';
export declare class PlacementConstraint implements flatbuffers.IUnpackableObject<PlacementConstraintT> {
    bb: flatbuffers.ByteBuffer | null;
    bb_pos: number;
    __init(i: number, bb: flatbuffers.ByteBuffer): PlacementConstraint;
    static getRootAsPlacementConstraint(bb: flatbuffers.ByteBuffer, obj?: PlacementConstraint): PlacementConstraint;
    static getSizePrefixedRootAsPlacementConstraint(bb: flatbuffers.ByteBuffer, obj?: PlacementConstraint): PlacementConstraint;
    noStacking(): boolean | null;
    requiredVertical(): boolean | null;
    minX(): number | null;
    minY(): number | null;
    minZ(): number | null;
    maxX(): number | null;
    maxY(): number | null;
    maxZ(): number | null;
    static startPlacementConstraint(builder: flatbuffers.Builder): void;
    static addNoStacking(builder: flatbuffers.Builder, noStacking: boolean): void;
    static addRequiredVertical(builder: flatbuffers.Builder, requiredVertical: boolean): void;
    static addMinX(builder: flatbuffers.Builder, minX: number): void;
    static addMinY(builder: flatbuffers.Builder, minY: number): void;
    static addMinZ(builder: flatbuffers.Builder, minZ: number): void;
    static addMaxX(builder: flatbuffers.Builder, maxX: number): void;
    static addMaxY(builder: flatbuffers.Builder, maxY: number): void;
    static addMaxZ(builder: flatbuffers.Builder, maxZ: number): void;
    static endPlacementConstraint(builder: flatbuffers.Builder): flatbuffers.Offset;
    static createPlacementConstraint(builder: flatbuffers.Builder, noStacking: boolean | null, requiredVertical: boolean | null, minX: number | null, minY: number | null, minZ: number | null, maxX: number | null, maxY: number | null, maxZ: number | null): flatbuffers.Offset;
    unpack(): PlacementConstraintT;
    unpackTo(_o: PlacementConstraintT): void;
}
export declare class PlacementConstraintT implements flatbuffers.IGeneratedObject {
    noStacking: boolean | null;
    requiredVertical: boolean | null;
    minX: number | null;
    minY: number | null;
    minZ: number | null;
    maxX: number | null;
    maxY: number | null;
    maxZ: number | null;
    constructor(noStacking?: boolean | null, requiredVertical?: boolean | null, minX?: number | null, minY?: number | null, minZ?: number | null, maxX?: number | null, maxY?: number | null, maxZ?: number | null);
    pack(builder: flatbuffers.Builder): flatbuffers.Offset;
}
//# sourceMappingURL=placement-constraint.d.ts.map