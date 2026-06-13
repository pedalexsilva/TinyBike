/**
 * Stylized sky: vertical gradient dome (shader), white sun disc with halo,
 * and a few low-poly toon clouds drifting around the planet.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    // Three-stop vertical gradient: warm horizon -> sky blue -> deep zenith.
    vec3 col = mix(uBottom, uMid, smoothstep(-0.05, 0.45, d.y));
    col = mix(col, uTop, smoothstep(0.4, 0.95, d.y));
    float s = dot(d, normalize(uSunDir));
    col += vec3(1.0) * smoothstep(0.9991, 0.9996, s);            // sun disc
    col += vec3(1.0, 0.9, 0.72) * pow(max(s, 0.0), 40.0) * 0.5;  // warm halo
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const SUN_DIR = new THREE.Vector3(0.5, 0.75, 0.35).normalize();

interface Cloud {
  pivot: THREE.Object3D;
  axis: THREE.Vector3;
  speed: number;
}

export class Sky {
  readonly dome: THREE.Mesh;
  readonly group = new THREE.Group();
  private clouds: Cloud[] = [];

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color('#2f7fd6') },
        uMid: { value: new THREE.Color('#62b4ff') },
        uBottom: { value: new THREE.Color('#aed2f5') },
        uSunDir: { value: SUN_DIR },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.buildClouds();
  }

  private buildClouds(): void {
    const cloudMat = toonMat(0xffffff, { emissive: 0x6688aa, emissiveIntensity: 0.15 });
    const puffGeo = new THREE.SphereGeometry(1, 10, 8);
    const orbitRadius = CONFIG.planet.radius + 26;

    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((p - puffs / 2) * 1.6, (p % 2) * 0.45, (p % 2) * 0.6);
        const s = 1.2 + Math.sin(i * 7 + p * 3) * 0.4;
        puff.scale.set(s * 1.5, s * 0.62, s);
        cloud.add(puff);
        if (p === 0) addOutline(puff, 0.06);
      }

      const dir = new THREE.Vector3()
        .setFromSphericalCoords(1, Math.acos(2 * ((i * 0.37) % 1) - 1), i * 2.4)
        .normalize();
      cloud.position.copy(dir).multiplyScalar(orbitRadius);
      cloud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

      const pivot = new THREE.Object3D();
      pivot.add(cloud);
      this.group.add(pivot);

      this.clouds.push({
        pivot,
        axis: new THREE.Vector3(Math.sin(i), 1, Math.cos(i * 2)).normalize(),
        speed: 0.004 + (i % 3) * 0.002,
      });
    }
  }

  /** Keep the dome centered on the camera; drift the clouds. */
  update(dt: number, cameraPos: THREE.Vector3): void {
    this.dome.position.copy(cameraPos);
    for (const c of this.clouds) {
      c.pivot.rotateOnAxis(c.axis, c.speed * dt);
    }
  }
}
