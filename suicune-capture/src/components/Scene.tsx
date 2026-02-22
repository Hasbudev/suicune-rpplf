"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, Environment, OrbitControls, Sparkles, useGLTF, useTexture } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { scale } from "framer-motion";

type Phase = "intro" | "idle" | "throwing" | "shaking" | "captured" | "fled";

// =================== TWEAK THESE ===================
const ENCOUNTER_POS = new THREE.Vector3(0, 2.9, 6); // your dirt path spot (Y usually 0)
const CAM_INTRO_OFFSET = new THREE.Vector3(-4.2, 4.6, 8.2);
const CAM_IDLE_OFFSET = new THREE.Vector3(-3.2, 3.8, 7.0);

const POKEBALL_SCALE = 0.1; // smaller
// ===================================================

export function Scene({
  phase,
  onIntroDone,
  onBallHit,
}: {
  phase: Phase;
  onIntroDone: () => void;
  onBallHit: () => void; // parent: setPhase("shaking") etc
}) {
  const [debugCam, setDebugCam] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") setDebugCam((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div onContextMenu={(e) => e.preventDefault()} className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: [0, 9, 14], fov: 42, near: 0.1, far: 80 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          logarithmicDepthBuffer: true,
        }}
      >
        {/* Background */}
        <color attach="background" args={["#05060c"]} />
        <fog attach="fog" args={["#05060c", 30, 120]} />

        {/* Lights */}
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[18, 28, 12]}
          intensity={1.25}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={80}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
        />

        <Environment preset="night" />

        {/* Town */}
        <TownEnvironment />
        <WallLogoDebug />
        <WallLogo />

        {/* Encounter VFX */}
        <Portal phase={phase} onIntroDone={onIntroDone} debugCam={debugCam} pos={ENCOUNTER_POS} />
        <Sparkles
          count={70}
          size={1.4}
          speed={0.5}
          opacity={0.25}
          scale={[6, 3, 6]}
          position={[ENCOUNTER_POS.x, ENCOUNTER_POS.y + 1.2, ENCOUNTER_POS.z]}
        />

        {/* Characters */}
        <SuicuneModel phase={phase} pos={ENCOUNTER_POS} />
        <PokeballModel phase={phase} pos={ENCOUNTER_POS} onHit={onBallHit} scale={POKEBALL_SCALE} />

        {/* PostFX */}
        <EffectComposer>
          <SMAA />
          <Bloom intensity={0.45} luminanceThreshold={0.35} luminanceSmoothing={0.9} />
          <Vignette eskil={false} offset={0.15} darkness={0.6} />
        </EffectComposer>

        {/* Debug camera (press C) */}
        {debugCam && (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan
            minDistance={3}
            maxDistance={80}
          />
        )}
      </Canvas>
    </div>
  );
}

/* ----------------------------- Town ----------------------------- */

function TownEnvironment() {
  const { scene } = useGLTF("/models/town.glb");
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const matAny = mesh.material as any;
      const mats = Array.isArray(matAny) ? matAny : [matAny];

      mats.forEach((m) => {
        if (!m) return;

        const texs = [m.map, m.emissiveMap, m.roughnessMap, m.metalnessMap, m.normalMap].filter(Boolean) as THREE.Texture[];
        texs.forEach((tex) => {
          tex.anisotropy = maxAniso;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
        });
      });
    });
  }, [scene, gl]);

  return <primitive object={scene} position={[0, -0.25, 0]} rotation={[0, Math.PI, 0]} scale={1} />;
}

function WallLogo() {
  const tex = useTexture("/textures/logo.png");

  // optional: make it look sharper
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  return (
    <mesh
      // 🔧 YOU WILL TWEAK THESE 3 VALUES
      position={[0, 2, 6]}   // x,y,z (place on the wall)
      rotation={[0, Math.PI, 0]}  // rotate to face the camera / match wall
    >
      <planeGeometry args={[2.2, 2.2]} /> {/* width, height */}
      <meshBasicMaterial
        map={tex}
        transparent
        alphaTest={0.05}  // removes dark fringe
        toneMapped={false}
      />
    </mesh>
  );
}

function WallLogoDebug() {
  const tex = useTexture("/textures/logo.png");
  const { camera } = useThree();

  // Make it look correct
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  return (
    <mesh
      // put it 3 units in front of the camera so you can't miss it
      position={[
        camera.position.x + 13,
        camera.position.y - 9,
        camera.position.z - 9,
      ]
      
    }
    scale={[1.5, 1.5, 1.5]}
    >
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={1}
        toneMapped={false}
        depthTest={false}  // always visible
      />
    </mesh>
  );
}

/* ----------------------------- Portal + Camera ----------------------------- */

function Portal({
  phase,
  onIntroDone,
  debugCam,
  pos,
}: {
  phase: Phase;
  onIntroDone: () => void;
  debugCam: boolean;
  pos: THREE.Vector3;
}) {
  const ring = useRef<THREE.Mesh | null>(null);
  const disk = useRef<THREE.Mesh | null>(null);
  const t = useRef(0);

  useFrame((state, delta) => {
    t.current += delta;

    // --- camera target ---
    const look = new THREE.Vector3(pos.x, pos.y + 1.15, pos.z);

    // --- camera positions (relative to encounter spot) ---
    const introCam = pos.clone().add(CAM_INTRO_OFFSET);
    const idleCam = pos.clone().add(CAM_IDLE_OFFSET);

    if (!debugCam) {
      const targetCam = phase === "intro" ? introCam : idleCam;
      state.camera.position.lerp(targetCam, 0.06);
      state.camera.lookAt(look);
    }

    if (!ring.current || !disk.current) return;

    const pulse = 0.5 + 0.5 * Math.sin(t.current * 2.1);
    const open = phase === "intro" ? THREE.MathUtils.clamp(t.current / 2.0, 0, 1) : 1;

    ring.current.scale.setScalar(1 + open * 0.18);
    disk.current.scale.setScalar(0.55 + open * 0.55);
    ring.current.rotation.z += delta * 0.35;

    const ringMat = ring.current.material as THREE.MeshStandardMaterial;
    const diskMat = disk.current.material as THREE.MeshStandardMaterial;

    ringMat.emissiveIntensity = 1.4 + pulse * 1.1;
    diskMat.emissiveIntensity = 1.1 + pulse * 1.0;

    if (!debugCam && phase === "intro" && t.current > 2.3) onIntroDone();
  });

  useEffect(() => {
    if (phase === "intro") t.current = 0;
  }, [phase]);

  return (
    <group position={[pos.x, pos.y + 1.2, pos.z]}>
      <mesh ref={ring}>
        <torusGeometry args={[1, 0.085, 16, 96]} />
        <meshStandardMaterial color="#87a9ff" emissive="#6bb7ff" emissiveIntensity={2} roughness={0.25} metalness={0.6} />
      </mesh>

      <mesh ref={disk} position={[0, 0, -0.06]} renderOrder={0}>
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial
          color="#071a2a"
          emissive="#2aa7ff"
          emissiveIntensity={1.6}
          transparent
          opacity={0.16}
          roughness={0.4}
          metalness={0.2}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

/* ----------------------------- Suicune + Smoke ----------------------------- */

function SuicuneModel({ phase, pos }: { phase: Phase; pos: THREE.Vector3 }) {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF("/models/suicune.glb");

  const t = useRef(0);
  const [smokeOn, setSmokeOn] = useState(false);
  const smokePos = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach((m) => {
          if (!m) return;
          m.transparent = true;
          m.opacity = 1;
          m.depthWrite = true;
        });
      }
    });
  }, [scene]);

  const fadeTo = (targetOpacity: number, lerpAlpha: number) => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach((m) => {
          if (!m) return;
          const current = typeof m.opacity === "number" ? m.opacity : 1;
          m.opacity = THREE.MathUtils.lerp(current, targetOpacity, lerpAlpha);
        });
      }
    });
  };

  useFrame((_, delta) => {
    t.current += delta;
    if (!group.current) return;

    const emerge = phase === "intro" ? THREE.MathUtils.clamp(t.current / 2, 0, 1) : 1;

    // emerge at encounter position
    const yTarget = THREE.MathUtils.lerp(pos.y - 0.8, pos.y + 1.1, emerge);
    const zTarget = THREE.MathUtils.lerp(pos.z - 2.2, pos.z - 0.6, emerge);
    const xTarget = pos.x;

    const bob = phase === "idle" ? Math.sin(t.current * 2) * 0.03 : 0;

    if (phase === "fled") {
      // move away + smoke
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, -Math.PI / 2, 0.12);
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, xTarget + 4.5, 0.10);
      group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, pos.z - 2.0, 0.10);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, pos.y + 0.2, 0.10);

      smokePos.current.copy(group.current.position);
      if (!smokeOn) setSmokeOn(true);

      fadeTo(0, 0.10);
      return;
    }

    if (smokeOn) setSmokeOn(false);

    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, xTarget, 0.10);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, zTarget, 0.10);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, yTarget + bob, 0.10);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, 0, 0.10);

    // vanish when ball touches him (shaking) and stay gone when captured
    const vanish = phase === "shaking" || phase === "captured";
    fadeTo(vanish ? 0 : 1, vanish ? 0.25 : 0.12);
  });

  return (
    <>
      <group ref={group}>
        <Center>
          <primitive object={scene} scale={0.065} />
        </Center>
      </group>

      {/* Big smoke when fled */}
      <SmokeBurst active={smokeOn} position={smokePos.current} strength={2.2} />
    </>
  );
}

function SmokeBurst({
  active,
  position,
  strength = 1,
}: {
  active: boolean;
  position: THREE.Vector3;
  strength?: number;
}) {
  const group = useRef<THREE.Group>(null!);
  const t = useRef(0);

  useEffect(() => {
    if (active) t.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!group.current) return;

    if (!active) {
      group.current.visible = false;
      return;
    }

    group.current.visible = true;
    t.current += delta;

    const life = Math.min(t.current / 0.85, 1); // longer smoke
    group.current.position.copy(position);
    group.current.scale.setScalar((0.6 + life * 2.4) * strength);

    group.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      mat.opacity = (1 - life) * 0.35 * strength;

      mesh.position.y = i * 0.08 + life * 0.55;
      mesh.position.x = (i % 2 === 0 ? 1 : -1) * (0.10 + life * 0.22) * Math.sin(i * 1.7);
      mesh.position.z = (0.10 + life * 0.22) * Math.cos(i * 1.3);
    });
  });

  return (
    <group ref={group} visible={false}>
      {Array.from({ length: 18 }).map((_, i) => (
        <mesh key={i} position={[0, 0, 0]}>
          <sphereGeometry args={[0.22, 10, 10]} />
          <meshStandardMaterial color="#cbd5e1" transparent opacity={0} roughness={1} metalness={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ----------------------------- Poké Ball GLB ----------------------------- */

function PokeballModel({
  phase,
  pos,
  onHit,
  scale,
}: {
  phase: Phase;
  pos: THREE.Vector3;
  onHit: () => void;
  scale: number;
}) {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF("/models/pokeball.glb");
  const { camera } = useThree();

  const t = useRef(0);
  const startRef = useRef(new THREE.Vector3());
  const endRef = useRef(new THREE.Vector3());
  const hitOnce = useRef(false);

  // Suicune "center" must match SuicuneModel offsets
  const targetPos = useMemo(() => new THREE.Vector3(pos.x, pos.y + 1.1, pos.z - 0.6), [pos]);

  // Materials for glow
  const allMats = useRef<THREE.MeshStandardMaterial[]>([]);
  useEffect(() => {
    allMats.current = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const mat = mesh.material as any;
        const mats: any[] = Array.isArray(mat) ? mat : [mat];
        mats.forEach((m) => {
          if (m && "roughness" in m) {
            const ms = m as THREE.MeshStandardMaterial;
            if (!ms.emissive) ms.emissive = new THREE.Color("#000000");
            allMats.current.push(ms);
          }
        });
      }
    });
  }, [scene]);

  const setGlow = (level: number) => {
    allMats.current.forEach((m) => {
      m.emissive = new THREE.Color("#ffffff");
      m.emissiveIntensity = level;
    });
  };

  useEffect(() => {
    if (phase === "throwing") {
      t.current = 0;
      hitOnce.current = false;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      // start in front of camera, slightly lower
      startRef.current
        .copy(camera.position)
        .add(dir.multiplyScalar(1.2))
        .add(new THREE.Vector3(0, -0.6, 0));

      endRef.current.copy(targetPos);

      group.current.visible = true;
      group.current.position.copy(startRef.current);
      group.current.rotation.set(0, 0, 0);
      setGlow(0);
    }
  }, [phase, camera, targetPos]);

  useFrame((_, delta) => {
    if (!group.current) return;

    if (phase === "throwing") {
      t.current = Math.min(t.current + delta * 1.7, 1);

      const p = startRef.current.clone().lerp(endRef.current, t.current);
      p.y += Math.sin(t.current * Math.PI) * 1.6; // arc

      group.current.position.copy(p);
      group.current.rotation.x += delta * 10;
      group.current.rotation.z += delta * 8;

      const dist = p.distanceTo(endRef.current);
      if (!hitOnce.current && dist < 0.45) {
        hitOnce.current = true;
        onHit();
      }

      return;
    }

    if (phase === "shaking") {
      group.current.visible = true;
      group.current.position.copy(endRef.current);

      const shake = Math.sin(Date.now() * 0.02) * 0.22;
      group.current.rotation.y = shake;
      group.current.rotation.z = shake * 0.4;

      const pulse = 0.35 + 0.25 * Math.sin(Date.now() * 0.02);
      setGlow(pulse);
      return;
    }

    if (phase === "captured") {
      group.current.visible = true;
      group.current.position.copy(endRef.current);
      group.current.rotation.y += delta * 3;
      setGlow(0.7);
      return;
    }

    // idle/intro/fled
    group.current.visible = false;
    t.current = 0;
    setGlow(0);
  });

  return (
    <group ref={group} visible={false} renderOrder={5} scale={scale}>
      <Center>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

/* ----------------------------- Preload ----------------------------- */

useGLTF.preload("/models/town.glb");
useGLTF.preload("/models/suicune.glb");
useGLTF.preload("/models/pokeball.glb");