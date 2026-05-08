"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ==================== 照片采样为粒子 ====================

function sampleImageToParticles(
  imageUrl: string,
  maxParticles: number = 60000
): Promise<{ positions: Float32Array; colors: Float32Array; count: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const aspect = img.width / img.height;
      const size = 256;
      canvas.width = size;
      canvas.height = Math.round(size / aspect);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const pixels: { x: number; y: number; r: number; g: number; b: number }[] = [];
      const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / maxParticles)));

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const i = (y * canvas.width + x) * 4;
          const r = data.data[i] / 255;
          const g = data.data[i + 1] / 255;
          const b = data.data[i + 2] / 255;
          const a = data.data[i + 3] / 255;
          if (a > 0.1 && (r + g + b) > 0.05) {
            // 跳过纯黑/透明像素
            pixels.push({
              x: (x / canvas.width - 0.5) * 20,
              y: -(y / canvas.height - 0.5) * 20 / aspect,
              r, g, b,
            });
          }
        }
      }

      const count = Math.min(pixels.length, maxParticles);
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const p = pixels[i];
        positions[i * 3] = p.x + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        colors[i * 3] = p.r;
        colors[i * 3 + 1] = p.g;
        colors[i * 3 + 2] = p.b;
      }

      resolve({ positions, colors, count });
    };
    img.onerror = () => {
      // 降级：生成随机星云
      const count = 20000;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * 10;
        positions[i * 3] = Math.cos(theta) * r;
        positions[i * 3 + 1] = Math.sin(theta) * r * 0.6;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        colors[i * 3] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 2] = 1.0;
      }
      resolve({ positions, colors, count });
    };
    img.src = imageUrl;
  });
}

// ==================== 自定义粒子着色器 ====================

const vertexShader = `
  uniform float uTime;
  uniform float uAudioLow;
  uniform float uAudioHigh;
  uniform vec3 uMousePos;
  uniform float uSpread;

  attribute vec3 color;

  varying vec3 vColor;
  varying float vDistToCenter;

  // 简单 3D 噪波
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    vec3 pos = position;

    float distToCenter = length(pos.xy);
    vDistToCenter = distToCenter;

    // 1. 基础呼吸波浪
    float wave = sin(distToCenter * 0.15 - uTime * 1.5) * 3.0;
    pos.z += wave * (0.3 + uAudioLow * 0.7);

    // 2. 音频低频驱动整体起伏
    pos.z += sin(uTime * 0.5 + pos.x * 0.1) * uAudioLow * 4.0;

    // 3. 鼠标斥力场
    float distToMouse = distance(pos, uMousePos);
    if (distToMouse < 15.0) {
      vec3 dir = normalize(pos - uMousePos + 0.001);
      float force = (15.0 - distToMouse) * 0.4;
      pos += dir * force;
    }

    // 4. 噪波扰动（高频驱动）
    float noise = snoise(pos * 0.08 + uTime * 0.3);
    pos.xy += vec2(noise) * (0.5 + uAudioHigh * 3.0);
    pos.z += snoise(pos * 0.1 + uTime * 0.2) * uAudioHigh * 2.0;

    // 5. 散开/聚合动画
    pos *= uSpread;

    vColor = color;

    // 高频增强颜色亮度
    vColor *= (1.0 + uAudioHigh * 0.5);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // 粒子大小：距离衰减 + 音频响应
    gl_PointSize = (8.0 / -mvPosition.z) * (1.0 + uAudioHigh * 0.5);
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`;

const fragmentShader = `
  varying vec3 vColor;

  void main() {
    // 圆形粒子，边缘渐变
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
    // 柔和发光
    vec3 glow = vColor * (1.0 + 0.3 * (1.0 - dist * 2.0));
    gl_FragColor = vec4(glow, alpha * 0.85);
  }
`;

// ==================== 粒子网格组件 ====================

interface ParticleMeshProps {
  imageUrl: string | null;
  audioLevel: { low: number; high: number };
  mousePos: THREE.Vector3;
  spread: number;
  onReady?: () => void;
}

function ParticleMesh({ imageUrl, audioLevel, mousePos, spread, onReady }: ParticleMeshProps) {
  const meshRef = useRef<THREE.Points>(null);
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uAudioLow: { value: 0 },
    uAudioHigh: { value: 0 },
    uMousePos: { value: new THREE.Vector3(0, 0, 0) },
    uSpread: { value: 0 },
  });

  // 采样照片生成粒子
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (!imageUrl) {
      // 默认星云
      const count = 15000;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.5) * 12;
        pos[i * 3] = Math.cos(theta) * r;
        pos[i * 3 + 1] = Math.sin(theta) * r * 0.6;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 3;
        col[i * 3] = 0.4 + Math.random() * 0.3;
        col[i * 3 + 1] = 0.5 + Math.random() * 0.3;
        col[i * 3 + 2] = 0.8 + Math.random() * 0.2;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      onReady?.();
      return geo;
    }

    // 异步采样照片
    sampleImageToParticles(imageUrl, 50000).then(({ positions, colors, count }) => {
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.setDrawRange(0, count);
      onReady?.();
    });

    return geo;
  }, [imageUrl]);

  // 动画循环
  useFrame((state) => {
    const u = uniformsRef.current;
    u.uTime.value = state.clock.elapsedTime;

    // 平滑音频响应
    u.uAudioLow.value += (audioLevel.low - u.uAudioLow.value) * 0.1;
    u.uAudioHigh.value += (audioLevel.high - u.uAudioHigh.value) * 0.15;
    u.uMousePos.value.copy(mousePos);
    u.uSpread.value += (spread - u.uSpread.value) * 0.05;
  });

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ==================== 鼠标追踪 ====================

function MouseTracker({ onMove }: { onMove: (pos: THREE.Vector3) => void }) {
  const { camera, pointer } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  useFrame(() => {
    raycaster.current.setFromCamera(pointer, camera);
    const target = new THREE.Vector3();
    raycaster.current.ray.intersectPlane(plane.current, target);
    if (target) onMove(target);
  });

  return null;
}

// ==================== 导出场景 ====================

interface NebulaSceneProps {
  imageUrl?: string | null;
  audioLevel?: { low: number; high: number };
  spread?: number;
  onReady?: () => void;
  className?: string;
}

export default function NebulaScene({
  imageUrl = null,
  audioLevel = { low: 0, high: 0 },
  spread = 1,
  onReady,
  className = "",
}: NebulaSceneProps) {
  const mousePos = useRef(new THREE.Vector3(0, 0, 0));

  return (
    <div className={`w-full h-full ${className}`} style={{ background: "#030305" }}>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 60 }}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#030305"]} />
        <MouseTracker onMove={(pos) => mousePos.current.copy(pos)} />
        <ParticleMesh
          imageUrl={imageUrl}
          audioLevel={audioLevel}
          mousePos={mousePos.current}
          spread={spread}
          onReady={onReady}
        />
        <EffectComposer>
          <Bloom
            intensity={1.5}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
