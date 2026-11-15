import * as THREE from 'three';

export const ps1GlobalUniforms = {
    uPs1Jitter: { value: 1.0 },
    uPs1SnapRes: { value: 160.0 }
};

export function setPS1JitterEnabled(enabled, snapRes = 160.0) {
    ps1GlobalUniforms.uPs1Jitter.value = enabled ? 1.0 : 0.0;
    ps1GlobalUniforms.uPs1SnapRes.value = snapRes;
}

export function configurePS1Texture(texture, repeatX = 1, repeatY = 1) {
    if (!texture) return texture;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

export function applyPS1Material(material, options = {}) {
    if (!material) return material;
    const { snap = true, repeatX = 1, repeatY = 1 } = options;

    if (material.map) {
        configurePS1Texture(material.map, repeatX, repeatY);
    }

    if (!snap) return material;

    const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
    material.customProgramCacheKey = () => `${prevKey}_ps1_snap`;

    const prevOnBeforeCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

        shader.uniforms.uPs1Jitter = ps1GlobalUniforms.uPs1Jitter;
        shader.uniforms.uPs1SnapRes = ps1GlobalUniforms.uPs1SnapRes;

        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            'uniform float uPs1Jitter;\nuniform float uPs1SnapRes;\nvoid main() {'
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            if (uPs1Jitter > 0.5 && gl_Position.w > 0.001) {
                vec2 ps1Grid = vec2(uPs1SnapRes, uPs1SnapRes * 0.75);
                vec2 ps1Ndc = gl_Position.xy / gl_Position.w;
                ps1Ndc = floor(ps1Ndc * ps1Grid + 0.5) / ps1Grid;
                gl_Position.xy = ps1Ndc * gl_Position.w;
            }`
        );
    };

    material.needsUpdate = true;
    return material;
}

export const VHS_POST_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(640, 480) },
        uGrain: { value: 0.085 },
        uAberration: { value: 0.0024 },
        uVSync: { value: 0.55 },
        uScanlines: { value: 0.10 },
        uVignette: { value: 0.28 },
        uPanic: { value: 0.0 },
        uFade: { value: 1.0 },
        uPeephole: { value: 0.0 },
        uGlitchSpike: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uGrain;
        uniform float uAberration;
        uniform float uVSync;
        uniform float uScanlines;
        uniform float uVignette;
        uniform float uPanic;
        uniform float uFade;
        uniform float uPeephole;
        uniform float uGlitchSpike;
        varying vec2 vUv;

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        void main() {
            vec2 uv = vUv;

            if (uPeephole > 0.01) {
                vec2 centered = uv - 0.5;
                float r2 = dot(centered, centered);
                uv = 0.5 + centered * (1.0 - 0.45 * uPeephole * r2 * 4.0);
            }

            float barPos = fract(uTime * 0.22);
            float distToBar = abs(uv.y - barPos);
            float barMask = smoothstep(0.055, 0.0, distToBar) * uVSync;
            float tearOffset = sin(uv.y * 120.0 + uTime * 35.0) * 0.008 * barMask;
            tearOffset += (hash(vec2(floor(uv.y * 240.0), floor(uTime * 24.0))) - 0.5) * 0.016 * barMask;

            float spikeRow = step(0.92 - uGlitchSpike * 0.4, hash(vec2(floor(uv.y * 48.0), floor(uTime * 18.0))));
            float spikeOffset = (hash(vec2(uv.y, uTime)) - 0.5) * 0.045 * uGlitchSpike * spikeRow;

            uv.x += tearOffset + spikeOffset;

            uv.x += sin(uv.y * 40.0 + uTime * 6.0) * 0.0005 * (uVSync + uGlitchSpike);

            float aber = uAberration * (1.0 + uPanic * 2.2 + barMask * 2.0 + uGlitchSpike * 3.5);
            vec2 dir = (uv - 0.5) * 2.0;
            float r = texture2D(tDiffuse, clamp(uv + dir * aber, 0.001, 0.999)).r;
            float g = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).g;
            float b = texture2D(tDiffuse, clamp(uv - dir * aber, 0.001, 0.999)).b;
            vec3 color = vec3(r, g, b);

            float barNoise = hash(floor(uv * uResolution) + floor(uTime * 30.0));
            color += vec3(barNoise * 0.22 * barMask);

            float scan = sin(uv.y * uResolution.y * 3.14159);
            color *= 1.0 - (uScanlines * 0.5 * (1.0 - scan));

            float grain = (hash(floor(uv * uResolution * 0.8) + fract(uTime * 17.31)) - 0.5) * 2.0;
            color += grain * (uGrain + uGlitchSpike * 0.14);

            float dist = length(vUv - 0.5);
            float vig = smoothstep(0.32, 0.86, dist);
            color *= 1.0 - vig * uVignette;

            if (uPanic > 0.01) {
                float pulse = 0.65 + 0.35 * sin(uTime * 8.0);
                color = mix(color, vec3(0.45, 0.02, 0.02), vig * uPanic * 0.65 * pulse);
            }

            if (uPeephole > 0.01) {
                vec2 pAspect = vec2((vUv.x - 0.5) * (uResolution.x / uResolution.y), vUv.y - 0.5);
                float hole = smoothstep(0.44, 0.38, length(pAspect));
                color *= mix(1.0, hole, uPeephole);
            }

            color = pow(clamp(color, 0.0, 1.0), vec3(0.88)) * 1.14;

            color = floor(color * 31.0 + 0.5) / 31.0;

            color *= uFade;
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
    `
};

