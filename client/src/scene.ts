import { getMaterial, isFront, type BuildResult, type CabinetConfig, type PartInstance } from '@planner/shared';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CabinetScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly cabinet = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Mesh[] = [];
  private readonly observer: ResizeObserver;
  private frameId = 0;
  private hovered: string | null = null;
  private framedSpan = 0;
  private config: CabinetConfig | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly onHover: (name: string | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor('#141311');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.target.set(0, 360, 0);

    this.scene.add(new THREE.AmbientLight('#f6f1e6', 0.38));
    this.scene.add(new THREE.HemisphereLight('#fff8ee', '#3d342c', 0.72));
    const sun = new THREE.DirectionalLight('#fff3e2', 1.45);
    sun.position.set(680, 1280, 860);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadow = sun.shadow.camera;
    shadow.left = -1600;
    shadow.right = 1600;
    shadow.top = 1800;
    shadow.bottom = -400;
    shadow.near = 10;
    shadow.far = 4000;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1800, 72),
      new THREE.MeshStandardMaterial({ color: '#211e1b', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(3000, 30, '#4a4036', '#2a2622');
    grid.position.y = 0;
    this.scene.add(grid);
    this.scene.add(this.cabinet);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.host.addEventListener('pointermove', this.onPointer);
    this.host.addEventListener('pointerleave', this.onLeave);
    this.resize();
    this.tick();
  }

  setModel(result: BuildResult, showFronts: boolean): void {
    this.clearCabinet();
    this.config = result.config;
    const parts = result.parts.filter((part) => showFronts || !isFront(part.kind));
    for (const part of parts) {
      const mesh = meshFor(part);
      this.cabinet.add(mesh);
      this.pickables.push(mesh);
    }
    this.cabinet.position.set(-result.config.width / 2, 0, -result.config.depth / 2);
    const span = Math.max(result.config.width, result.config.height, result.config.depth);
    const jump = this.framedSpan === 0 || Math.abs(span - this.framedSpan) / this.framedSpan > 0.2;
    if (jump) {
      this.frame();
      this.framedSpan = span;
    } else {
      this.controls.target.y = result.config.height / 2;
    }
  }

  frame(): void {
    if (!this.config) return;
    const { width, height, depth } = this.config;
    const aspect = this.camera.aspect || 1;
    const fov = (this.camera.fov * Math.PI) / 180;
    const margin = 180;
    const halfH = height / 2 + margin;
    const halfW = Math.hypot(width, depth) / 2 + margin;
    const fit = Math.max(halfH / Math.tan(fov / 2), halfW / (Math.tan(fov / 2) * aspect));
    const distance = fit * 1.12;
    const target = new THREE.Vector3(0, height / 2, 0);
    const direction = new THREE.Vector3(0.72, 0.34, 1).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.near = Math.max(1, distance / 200);
    this.camera.far = distance * 12;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.framedSpan = Math.max(width, height, depth);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.host.removeEventListener('pointermove', this.onPointer);
    this.host.removeEventListener('pointerleave', this.onLeave);
    this.clearCabinet();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private tick = (): void => {
    this.frameId = requestAnimationFrame(this.tick);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private onPointer = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    const name = typeof hit?.object.userData.name === 'string' ? hit.object.userData.name : null;
    if (name === this.hovered) return;
    this.paint(this.hovered, false);
    this.hovered = name;
    this.paint(name, true);
    this.onHover(name);
  };

  private onLeave = (): void => {
    this.paint(this.hovered, false);
    this.hovered = null;
    this.onHover(null);
  };

  private paint(name: string | null, active: boolean): void {
    if (!name) return;
    for (const mesh of this.pickables) {
      if (mesh.userData.name !== name) continue;
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.emissive.set(active ? '#d86a3a' : '#000000');
        mesh.material.emissiveIntensity = active ? 0.38 : 0;
      }
    }
  }

  private clearCabinet(): void {
    this.paint(this.hovered, false);
    this.hovered = null;
    for (const mesh of this.pickables) disposeMesh(mesh);
    this.cabinet.clear();
    this.pickables.length = 0;
  }
}

function meshFor(part: PartInstance): THREE.Mesh {
  const gap = 0.7;
  const geometry = new THREE.BoxGeometry(
    Math.max(0.4, part.size[0] - gap),
    Math.max(0.4, part.size[1] - gap),
    Math.max(0.4, part.size[2] - gap),
  );
  const source = getMaterial(part.materialId);
  const material = new THREE.MeshStandardMaterial({
    color: source.color,
    roughness: isFront(part.kind) ? 0.48 : 0.8,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(part.center[0], part.center[1], part.center[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.name = part.name;
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: '#2a221c' }),
    ),
  );
  return mesh;
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}
