import * as THREE from 'three';

export const ps1GlobalUniforms = {
    uPs1Jitter: { value: 0.0 },
    uPs1SnapRes: { value: 320.0 }
};

export function setPS1JitterEnabled(enabled, snapRes = 320.0) {
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
        uGrain: { value: 0.015 },
        uSharpen: { value: 0.48 },
        uAberration: { value: 0.0008 },
        uVSync: { value: 0.0 },
        uScanlines: { value: 0.0 },
        uVignette: { value: 0.30 },
        uWakeVignette: { value: 0.0 },
        uPanic: { value: 0.0 },
        uFade: { value: 1.0 },
        uPeephole: { value: 0.0 },
        uGlitchSpike: { value: 0.0 },
        uBrightness: { value: 0.7 }
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
        uniform float uSharpen;
        uniform float uAberration;
        uniform float uVSync;
        uniform float uScanlines;
        uniform float uVignette;
        uniform float uWakeVignette;
        uniform float uPanic;
        uniform float uFade;
        uniform float uPeephole;
        uniform float uGlitchSpike;
        uniform float uBrightness;
        varying vec2 vUv;

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        vec3 sampleColor(vec2 coord, float aber) {
            vec2 dir = (coord - 0.5) * 2.0;
            float r = texture2D(tDiffuse, clamp(coord + dir * aber, 0.001, 0.999)).r;
            float g = texture2D(tDiffuse, clamp(coord, 0.001, 0.999)).g;
            float b = texture2D(tDiffuse, clamp(coord - dir * aber, 0.001, 0.999)).b;
            return vec3(r, g, b);
        }

        void main() {
            vec2 uv = vUv;

            if (uPeephole > 0.01) {
                vec2 centered = uv - 0.5;
                float r2 = dot(centered, centered);
                uv = 0.5 + centered * (1.0 - 0.45 * uPeephole * r2 * 4.0);
            }

            if (uGlitchSpike > 0.01) {
                float spikeRow = step(0.92 - uGlitchSpike * 0.4, hash(vec2(floor(uv.y * 48.0), floor(uTime * 18.0))));
                float spikeOffset = (hash(vec2(uv.y, uTime)) - 0.5) * 0.04 * uGlitchSpike * spikeRow;
                uv.x += spikeOffset;
            }

            float aber = uAberration * (1.0 + uPanic * 2.0 + uGlitchSpike * 3.0);
            vec3 centerCol = sampleColor(uv, aber);

            // PS1 Crisp Sharpening (Unsharp Mask kernel)
            vec2 texel = 1.0 / max(uResolution, vec2(1.0));
            vec3 nN = texture2D(tDiffuse, clamp(uv + vec2(0.0, texel.y), 0.001, 0.999)).rgb;
            vec3 nS = texture2D(tDiffuse, clamp(uv - vec2(0.0, texel.y), 0.001, 0.999)).rgb;
            vec3 nE = texture2D(tDiffuse, clamp(uv + vec2(texel.x, 0.0), 0.001, 0.999)).rgb;
            vec3 nW = texture2D(tDiffuse, clamp(uv - vec2(texel.x, 0.0), 0.001, 0.999)).rgb;
            vec3 blurCol = (nN + nS + nE + nW) * 0.25;
            vec3 color = centerCol + (centerCol - blurCol) * (uSharpen * 1.65);

            // Fine Film Grain
            float grain = (hash(floor(uv * uResolution) + fract(uTime * 23.17)) - 0.5) * 2.0;
            color += grain * (uGrain + uGlitchSpike * 0.12);

            // Base Vignette
            float dist = length(vUv - 0.5);
            float vig = smoothstep(0.32, 0.86, dist);
            color *= 1.0 - vig * uVignette;

            // Awakening Eyelid / Vignette Effect
            if (uWakeVignette > 0.001) {
                vec2 eyeUv = vUv - 0.5;
                float eyeOpen = max(0.02, 1.0 - uWakeVignette);
                eyeUv.y /= (eyeOpen * 0.72);
                eyeUv.x /= (0.55 + eyeOpen * 0.45);
                float eyeDist = length(eyeUv);
                float wakeMask = smoothstep(0.28, 0.85, eyeDist);
                float darkFactor = clamp(wakeMask + pow(uWakeVignette, 1.6), 0.0, 1.0);
                color *= (1.0 - darkFactor);
            }

            if (uPanic > 0.01) {
                float pulse = 0.65 + 0.35 * sin(uTime * 8.0);
                color = mix(color, vec3(0.45, 0.02, 0.02), vig * uPanic * 0.65 * pulse);
            }

            if (uPeephole > 0.01) {
                vec2 pAspect = vec2((vUv.x - 0.5) * (uResolution.x / uResolution.y), vUv.y - 0.5);
                float hole = smoothstep(0.44, 0.38, length(pAspect));
                color *= mix(1.0, hole, uPeephole);
            }

            color = pow(clamp(color, 0.0, 1.0), vec3(0.90)) * (1.12 * uBrightness);

            // PS1 15-bit (5-5-5) color quantization
            color = floor(clamp(color, 0.0, 1.0) * 31.0 + 0.5) / 31.0;

            color *= uFade;
            gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
    `
};
