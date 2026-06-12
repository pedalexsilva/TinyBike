/**
 * Minimal augmentation for three-mesh-bvh usage.
 * (Only added if the library's own augmentation is not picked up.)
 */
import type { MeshBVH } from 'three-mesh-bvh';

declare module 'three' {
  interface BufferGeometry {
    boundsTree?: MeshBVH;
  }
  interface Raycaster {
    firstHitOnly?: boolean;
  }
}
