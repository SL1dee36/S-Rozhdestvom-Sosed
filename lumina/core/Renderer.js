import * as THREE from 'three';
import { VHS_POST_SHADER, setPS1JitterEnabled } from './PS1Shader.js';

export class Renderer {
    constructor(canvasId, width = 640, height = 480) {
        const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!canvas) {
            throw new Error(`Renderer: Canvas element with ID "${canvasId}" not found in DOM.`);
        }

        this.renderWidth = width;
        this.renderHeight = height;
        this.ps1Enabled = true;

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;

        this.domElement = this.renderer.domElement;
        this.domElement.style.imageRendering = 'pixelated';

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x04050a);
        this.scene.fog = new THREE.FogExp2(0x0a0e1a, 0.018);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 250);

        this.renderTarget = new THREE.WebGLRenderTarget(this.renderWidth, this.renderHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            stencilBuffer: false
        });
        this.renderTarget.texture.generateMipmaps = false;

        this.postScene = new THREE.Scene();
        this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.postMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(VHS_POST_SHADER.uniforms),
            vertexShader: VHS_POST_SHADER.vertexShader,
            fragmentShader: VHS_POST_SHADER.fragmentShader,
            depthTest: false,
            depthWrite: false
        });
        this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
        this.postMaterial.uniforms.uResolution.value.set(this.renderWidth, this.renderHeight);

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
        this.postScene.add(quad);

        this._elapsed = 0;
        this.bypassPostProcess = false;
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    setBypassPostProcess(bypass) {
        this.bypassPostProcess = !!bypass;
    }

    setPS1Jitter(enabled, snapRes = 160.0) {
        this.ps1Enabled = enabled;
        setPS1JitterEnabled(enabled, snapRes);
    }

    setPostProcessParams(params = {}) {
        const u = this.postMaterial.uniforms;
        if (params.grain !== undefined) u.uGrain.value = params.grain;
        if (params.sharpen !== undefined) u.uSharpen.value = params.sharpen;
        if (params.aberration !== undefined) u.uAberration.value = params.aberration;
        if (params.vsync !== undefined) u.uVSync.value = params.vsync;
        if (params.scanlines !== undefined) u.uScanlines.value = params.scanlines;
        if (params.vignette !== undefined) u.uVignette.value = params.vignette;
        if (params.wakeVignette !== undefined) u.uWakeVignette.value = params.wakeVignette;
        if (params.panic !== undefined) u.uPanic.value = params.panic;
        if (params.fade !== undefined) u.uFade.value = params.fade;
        if (params.peephole !== undefined) u.uPeephole.value = params.peephole;
        if (params.glitchSpike !== undefined) u.uGlitchSpike.value = params.glitchSpike;
        if (params.brightness !== undefined) u.uBrightness.value = params.brightness;
    }

    precompileScene() {
        const hiddenStates = [];
        this.scene.traverse((obj) => {
            if (!obj.visible) {
                hiddenStates.push(obj);
                obj.visible = true;
            }
        });
        try {
            this.renderer.compile(this.scene, this.camera);
        } catch (e) {}
        for (const obj of hiddenStates) {
            obj.visible = false;
        }
    }

    triggerGlitch(intensity = 1.0) {
        this.postMaterial.uniforms.uGlitchSpike.value = Math.max(
            this.postMaterial.uniforms.uGlitchSpike.value,
            intensity
        );
    }

    setFOV(fov) {
        if (Math.abs(this.camera.fov - fov) > 0.01) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }

    update(deltaTime) {
        this._elapsed += deltaTime;
        const u = this.postMaterial.uniforms;
        u.uTime.value = this._elapsed;
        if (u.uGlitchSpike.value > 0) {
            u.uGlitchSpike.value = Math.max(0, u.uGlitchSpike.value - deltaTime * 2.5);
        }
    }

    render() {
        if (this.bypassPostProcess) {
            this.renderer.setRenderTarget(null);
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postScene, this.postCamera);
    }
}

export default Renderer;
