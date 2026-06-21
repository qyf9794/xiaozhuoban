/**
 * [INPUT]: 依赖 ./shaders/* 的 6 个 GLSL 字符串与 waveUniforms/dotsUniforms
 * [OUTPUT]: SiriRenderer 类 — WebGL2 三 pass 渲染器（effect FBO → scene FBO → screen）
 * [POS]: js/ 的渲染核心；只消费 state.js 给的 surface/progress 与 audio 的 bands，不含任何交互逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Pipeline (every pass draws one fullscreen triangle, no vertex buffers):
//
//   [1] effect FBO (square, follows panel size x 1.18)
//       wave pass + dots pass, additive premultiplied (ONE, 1-SRC_ALPHA)
//   [2] scene FBO (canvas size)
//       background photo, then effect composite (adds the dark container)
//   [3] default framebuffer
//       glass composite: photo outside the panel, refracted scene inside
//
// Uniform upload is cached per program (type inference + value memo), so
// unchanged uniforms cost nothing per frame.
// ============================================================================

import { VERTEX_SHADER } from './shaders/vertex.glsl.js?v=20260621-voice-audio-wave';
import { WAVE_FRAGMENT_SHADER } from './shaders/wave.frag.glsl.js?v=20260621-voice-audio-wave';
import { DOTS_FRAGMENT_SHADER } from './shaders/dots.frag.glsl.js?v=20260621-voice-audio-wave';
import { BACKGROUND_FRAGMENT_SHADER } from './shaders/background.frag.glsl.js?v=20260621-voice-audio-wave';
import { EFFECT_COMPOSITE_FRAGMENT_SHADER } from './shaders/effect-composite.frag.glsl.js?v=20260621-voice-audio-wave';
import { GLASS_COMPOSITE_FRAGMENT_SHADER } from './shaders/glass-composite.frag.glsl.js?v=20260621-voice-audio-wave';
import { WAVE_PRESETS, waveUniforms, dotsUniforms } from './shaders/uniforms.js?v=20260621-voice-audio-wave';

const MAX_DPR = 2;
const PANEL_MARGIN_PX = 20;
const EFFECT_OVERDRAW = 1.18; // effect FBO is 18% larger than the panel core
// corner radius ceiling (CSS px). Below it the shape is a true capsule/circle;
// past it (tall dynamic answer pill) the corners stop growing so the glass is
// a rounded square — kept tighter than the capsule radius (iOS-26 squircle
// restraint) so the expanded pill reads as a panel, not a blob.
const CORNER_RADIUS_MAX_PX = 44;
const FALLBACK_PIXEL = new Uint8Array([3, 4, 8, 255]); // 1x1 near-black until photo loads

// corner radius = min(half) capsule, but the ceiling eases IN with the morph:
// orb (answer≈0) keeps its full radius (a circle is never clamped square),
// expanded (answer≈1) falls to CORNER_RADIUS_MAX so a tall answer is a
// squircle. answer may overshoot past 1 on the burst — clamp the lerp.
function cornerRadiusFor(coreWidth, coreHeight, answer, dpr) {
	const half = Math.min(coreWidth, coreHeight) * 0.5;
	const t = Math.max(0, Math.min(1, answer));
	const ceiling = half + (CORNER_RADIUS_MAX_PX * dpr - half) * t;
	return Math.min(half, ceiling);
}

// ---------------------------------------------------------------------------
// uniform value plumbing
// ---------------------------------------------------------------------------

function isTypedArray(value) {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function arraysEqual(a, b) {
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function toNumberArray(value) {
	if (typeof value === 'number' || typeof value === 'boolean') return [Number(value)];
	if (Array.isArray(value)) return value.flat(Number.POSITIVE_INFINITY).map(Number);
	if (isTypedArray(value)) return Array.from(value, Number);
	return [];
}

function inferUniformType(declared, value) {
	if (declared) return declared;
	if (typeof value === 'boolean') return 'bool';
	if (typeof value === 'number') return 'float';
	const list = toNumberArray(value);
	if (list.length === 2) return 'vec2';
	if (list.length === 3) return 'vec3';
	if (list.length === 4) return 'vec4';
	if (list.length === 9) return 'mat3';
	if (list.length === 16) return 'mat4';
	return 'float';
}

// ---------------------------------------------------------------------------
// GL object helpers
// ---------------------------------------------------------------------------

function compileShader(gl, type, source, label) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) || `Unknown ${label} shader compile error.`;
		gl.deleteShader(shader);
		throw new Error(message);
	}
	return shader;
}

function createProgram(gl, fragmentSource, label) {
	const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER, `${label} vertex`);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
	const program = gl.createProgram();
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const message = gl.getProgramInfoLog(program) || `Unknown ${label} program link error.`;
		gl.deleteProgram(program);
		throw new Error(message);
	}
	return { label, program, uniforms: new Map(), types: new Map(), values: new Map() };
}

function createLinearClampTexture(gl) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	return texture;
}

function createRenderTarget(gl, width, height, internalFormat, format, type) {
	const texture = createLinearClampTexture(gl);
	gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
	const framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
		gl.deleteFramebuffer(framebuffer);
		gl.deleteTexture(texture);
		throw new Error('Siri 27 framebuffer is incomplete.');
	}
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { framebuffer, texture, width, height };
}

function destroyRenderTarget(gl, target) {
	if (!target) return;
	gl.deleteFramebuffer(target.framebuffer);
	gl.deleteTexture(target.texture);
}

// ---------------------------------------------------------------------------
// renderer
// ---------------------------------------------------------------------------

export class SiriRenderer {
	constructor(canvas, { wavePreset = 'bloom', embedded = false } = {}) {
		this.canvas = canvas;
		this.wavePreset = WAVE_PRESETS[wavePreset] || WAVE_PRESETS.bloom;
		// embedded: the canvas floats over a host page — everything outside the
		// glass panel renders transparent (premultiplied), so the host supplies
		// the visible backdrop and this renderer only refracts its texture copy
		this.embedded = embedded;
		this.gl = canvas.getContext('webgl2', {
			alpha: embedded,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: embedded,
			preserveDrawingBuffer: false,
		});
			this.dpr = 1;
			this.width = 1;
			this.height = 1;
			this.time = 0;
			this.colorMode = 'mono';
		this.panelOffset = [0, 0]; // device px, set by main.js drag springs
		// chip lenses (suggestion buttons rendered AS glass by the final pass):
		// rects = [cx, cy, halfW, halfH] in device px relative to the panel
		// center, states = per-chip visibility. main.js measures the DOM
		// buttons each frame; all-zero states make the pass a no-op.
		this.chipLenses = {
			rects: [
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
			],
			states: [0, 0, 0],
			hovers: [0, 0, 0],
		};
		this.backgroundSize = [1, 1];
		this.backgroundReady = 0;
		this.backgroundTexture = null;
		this.effectTarget = null;
		this.sceneTarget = null;
		this.disposed = false;
		this.error = null;
		this._lastImage = null;
		this._contextLost = false;
		// Dynamic-Island dark container (see effect-composite shader)
		this.container = { black: 0.25, fade: 1, gauss: 8, strength: 0.9 };
		// anger: deep wine-red tint on the dark container, raised by main/ask-flow
		// when a reply opens with "!!!!". 0 = neutral black, 1 = full red glow.
		this.anger = 0;
		this.angerTint = [0.36, 0.04, 0.05]; // ~#5d0a0d, deep "holding back fire" red

		this._onContextLost = (event) => {
			event.preventDefault();
			this._contextLost = true;
			this.effectTarget = null;
			this.sceneTarget = null;
		};
		this._onContextRestored = () => {
			try {
				this._contextLost = false;
				this.error = null;
				this._initGL();
			} catch (error) {
				this.error = error;
				this._dispatchError(error);
			}
		};

		if (!this.gl) {
			this.error = new Error('WebGL2 is not available in this browser.');
			this._dispatchError(this.error);
			return;
		}
		this.canvas.addEventListener('webglcontextlost', this._onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);
		try {
			this._initGL();
		} catch (error) {
			this.error = error;
			this._dispatchError(error);
		}
	}

	_initGL() {
		const gl = this.gl;
		this.vertexArray = gl.createVertexArray();
		this.programs = {
			wave: createProgram(gl, WAVE_FRAGMENT_SHADER, 'wave'),
			dots: createProgram(gl, DOTS_FRAGMENT_SHADER, 'dots'),
			background: createProgram(gl, BACKGROUND_FRAGMENT_SHADER, 'background'),
			effectComposite: createProgram(gl, EFFECT_COMPOSITE_FRAGMENT_SHADER, 'effect composite'),
			glassComposite: createProgram(gl, GLASS_COMPOSITE_FRAGMENT_SHADER, 'glass composite'),
		};
		this.backgroundTexture = createLinearClampTexture(gl);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, FALLBACK_PIXEL);
		gl.bindVertexArray(this.vertexArray);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.STENCIL_TEST);
		this.backgroundReady = 0;
		this.backgroundSize = [1, 1];
		this.effectTarget = null;
		this.sceneTarget = null;
		if (this._lastImage) this.setBackgroundImage(this._lastImage);
	}

		setBackgroundImage(image) {
		const gl = this.gl;
		this._lastImage = image;
		if (!gl || this.disposed || this.error || this._contextLost) return;
		gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		this.backgroundSize = [image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1];
			this.backgroundReady = 1;
		}

		setColorMode(colorMode) {
			this.colorMode = colorMode === 'color' ? 'color' : 'mono';
		}

	render({ surface, progress, bands, sizes, dt = 0 }) {
		if (!this.gl || this.disposed || this.error || this._contextLost || !surface || !sizes) return;
		this.time = (this.time + Math.max(0, Math.min(dt, 0.1))) % 1e5;
		this._resize();
		const layout = this._layout(surface, sizes);
		this._ensureTargets(layout);
		this._renderEffectPass(surface, progress, bands, layout);
		this._renderScenePass(layout);
		this._renderGlassPass(layout);
	}

	dispose() {
		const gl = this.gl;
		if (this._onContextLost) {
			this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
			this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
		}
		if (!gl || this.disposed) return;
		destroyRenderTarget(gl, this.effectTarget);
		destroyRenderTarget(gl, this.sceneTarget);
		if (this.backgroundTexture) gl.deleteTexture(this.backgroundTexture);
		for (const entry of Object.values(this.programs || {})) {
			gl.deleteProgram(entry.program);
		}
		if (this.vertexArray) gl.deleteVertexArray(this.vertexArray);
		this.effectTarget = null;
		this.sceneTarget = null;
		this.backgroundTexture = null;
		this.disposed = true;
	}

	_resize() {
		// layout px, NOT getBoundingClientRect: a host may CSS-scale the canvas
		// (the z1 deck does), and every consumer of this.dpr — panelOffset,
		// sizes, chip lenses, the DOM overlay — speaks layout px. Mixing in
		// visual px would shrink the glass against its own text by the scale.
		const cssWidth = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1);
		const cssHeight = Math.max(1, this.canvas.clientHeight || window.innerHeight || 1);
		const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
		const width = Math.max(1, Math.round(cssWidth * dpr));
		const height = Math.max(1, Math.round(cssHeight * dpr));
		if (width === this.width && height === this.height && dpr === this.dpr) return;
		this.dpr = dpr;
		this.width = width;
		this.height = height;
		this.canvas.width = width;
		this.canvas.height = height;
	}

	// Panel grows slightly with press (x1.018); the effect FBO does NOT —
	// it stays at core * 1.18 so the wave can overdraw the panel.
	// surface.answer (0→1, may overshoot) morphs the circle into the answer
	// pill: width/height lerp toward sizes.answer. cornerRadius is min(half)
	// — a true capsule/circle — but the corner CEILING ramps in with the
	// morph: at answer=0 the orb keeps its full radius (perfect circle); only
	// as it expands does the ceiling fall to CORNER_RADIUS_MAX_PX, so a tall
	// answer settles as a squircle panel. The orb must never go square.
	_layout(surface, sizes) {
		const pressScale = 1 + surface.press * 0.018;
		const margin = PANEL_MARGIN_PX * this.dpr;
		const answer = surface.answer || 0;
		const baseSize = sizes.expanded.width * this.dpr;
		const answerWidth = Math.min(sizes.answer.width * this.dpr, this.width - 48 * this.dpr);
		const answerHeight = sizes.answer.height * this.dpr;
		const coreWidth = (baseSize + (answerWidth - baseSize) * answer) * pressScale;
		const coreHeight = (baseSize + (answerHeight - baseSize) * answer) * pressScale;
		const panelWidth = coreWidth + margin * 2;
		const panelHeight = coreHeight + margin * 2;
		const effectWidth = Math.max(1, Math.round(coreWidth * EFFECT_OVERDRAW));
		const effectHeight = Math.max(1, Math.round(coreHeight * EFFECT_OVERDRAW));
		const panelX = (this.width - panelWidth) * 0.5 + this.panelOffset[0];
		const panelY = (this.height - panelHeight) * 0.5 + this.panelOffset[1];
		const panelCenterY = panelY + panelHeight * 0.5;
		return {
			effectWidth,
			effectHeight,
			effectOrigin: [(this.width - effectWidth) * 0.5 + this.panelOffset[0], panelCenterY - effectHeight * 0.5],
			effectSize: [effectWidth, effectHeight],
			panelOrigin: [panelX, panelY],
			panelSize: [panelWidth, panelHeight],
			margin,
			cornerRadius: cornerRadiusFor(coreWidth, coreHeight, answer, this.dpr),
			containerStrength:
				this.container.strength * Math.min(1, Math.max(0, Math.max(surface.sharedResolved || 0, answer))),
		};
	}

	_ensureTargets(layout) {
		const gl = this.gl;
		const internalFormat = gl.RGBA8;
		const type = gl.UNSIGNED_BYTE;
		if (
			!this.effectTarget ||
			this.effectTarget.width !== layout.effectWidth ||
			this.effectTarget.height !== layout.effectHeight
		) {
			destroyRenderTarget(gl, this.effectTarget);
			this.effectTarget = createRenderTarget(gl, layout.effectWidth, layout.effectHeight, internalFormat, gl.RGBA, type);
		}
		if (!this.sceneTarget || this.sceneTarget.width !== this.width || this.sceneTarget.height !== this.height) {
			destroyRenderTarget(gl, this.sceneTarget);
			this.sceneTarget = createRenderTarget(gl, this.width, this.height, internalFormat, gl.RGBA, type);
		}
	}

	_renderEffectPass(surface, progress, bands, layout) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.effectTarget.framebuffer);
		gl.viewport(0, 0, layout.effectWidth, layout.effectHeight);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied over
		const shared = [
			{ name: 'uResolution', type: 'vec2', value: [layout.effectWidth, layout.effectHeight] },
			{ name: 'uTime', value: this.time },
			{ name: 'uMouse', type: 'vec4', value: [layout.effectWidth * 0.5, layout.effectHeight * 0.5, surface.press, 0] },
		];
			this._draw(this.programs.wave, [
				...shared,
				...waveUniforms(surface, bands, this.wavePreset, { monoMode: this.colorMode === 'mono' ? 1 : 0 }),
			]);
		this._draw(this.programs.dots, [...shared, ...dotsUniforms(surface, progress)]);
		gl.disable(gl.BLEND);
	}

	_renderScenePass(layout) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		this._draw(
			this.programs.background,
			[
				{ name: 'uResolution', type: 'vec2', value: [this.width, this.height] },
				{ name: 'uTextureSize', type: 'vec2', value: this.backgroundSize },
				{ name: 'uCanvasSize', type: 'vec2', value: [this.width, this.height] },
				{ name: 'uBackgroundReady', value: this.backgroundReady },
			],
			[{ name: 'uBackground', texture: this.backgroundTexture, unit: 0 }],
		);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		this._draw(
			this.programs.effectComposite,
			[
				{ name: 'uResolution', type: 'vec2', value: [this.width, this.height] },
				{ name: 'uCanvasSize', type: 'vec2', value: [this.width, this.height] },
				{ name: 'uEffectOrigin', type: 'vec2', value: layout.effectOrigin },
				{ name: 'uEffectSize', type: 'vec2', value: layout.effectSize },
				{ name: 'uContainer', value: layout.containerStrength },
				{ name: 'uContainerBlack', value: this.container.black },
				{ name: 'uContainerFade', value: this.container.fade },
				{ name: 'uContainerGauss', value: this.container.gauss },
				{ name: 'uContainerTint', type: 'vec3', value: this.angerTint },
				{ name: 'uAnger', value: this.anger },
			],
			[{ name: 'uEffectTexture', texture: this.effectTarget.texture, unit: 0 }],
		);
		gl.disable(gl.BLEND);
	}

	_renderGlassPass(layout) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, this.embedded ? 0 : 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		this._draw(
			this.programs.glassComposite,
			[
					{ name: 'uResolution', type: 'vec2', value: [this.width, this.height] },
					{ name: 'uTextureSize', type: 'vec2', value: this.backgroundSize },
					{ name: 'uTime', value: this.time },
					{ name: 'uPanelSize', type: 'vec2', value: layout.panelSize },
				{ name: 'uCanvasSize', type: 'vec2', value: [this.width, this.height] },
				{ name: 'uPanelOrigin', type: 'vec2', value: layout.panelOrigin },
				{ name: 'uMarginPx', value: layout.margin },
				{ name: 'uCornerRadius', value: layout.cornerRadius },
				{ name: 'uHeight', value: 18 * this.dpr },
				{ name: 'uCurvature', value: 1 },
				{ name: 'uRefractAmount', value: -56 * this.dpr },
				{ name: 'uAngle', value: 0 },
				{ name: 'uGradRadialMix', value: 0.08 },
				{ name: 'uKeyAngle', value: Math.PI * 0.25 },
				{ name: 'uFillAngle', value: Math.PI * 1.25 },
				{ name: 'uHlHeight', value: 2.2 * this.dpr },
				{ name: 'uHlCut', value: 0.52 },
				{ name: 'uHlNorm', value: 8 },
				{ name: 'uHlAmount', value: 0.72 },
				{ name: 'uHlCurv', value: 1 },
				{ name: 'uBackgroundReady', value: this.backgroundReady },
				{ name: 'uTransparentOutside', value: this.embedded ? 1 : 0 },
				{ name: 'uChip0', type: 'vec4', value: this.chipLenses.rects[0] },
				{ name: 'uChip1', type: 'vec4', value: this.chipLenses.rects[1] },
				{ name: 'uChip2', type: 'vec4', value: this.chipLenses.rects[2] },
				{ name: 'uChipState', type: 'vec3', value: this.chipLenses.states },
				{ name: 'uChipHover', type: 'vec3', value: this.chipLenses.hovers },
				{ name: 'uChipRefract', value: -22 * this.dpr },
				{ name: 'uChipHeight', value: 7 * this.dpr },
				{ name: 'uChipHlAmount', value: 0.6 },
				{ name: 'uChipFace', value: 0.1 },
			],
			[
				{ name: 'uSceneTexture', texture: this.sceneTarget.texture, unit: 0 },
				{ name: 'uBackground', texture: this.backgroundTexture, unit: 1 },
			],
		);
	}

	_draw(programEntry, uniforms = [], textures = []) {
		const gl = this.gl;
		gl.useProgram(programEntry.program);
		gl.bindVertexArray(this.vertexArray);
		for (const binding of textures) {
			this._setTexture(programEntry, binding.name, binding.texture, binding.unit);
		}
		for (const uniform of uniforms) {
			this._setUniform(programEntry, uniform.name, uniform.value, uniform.type);
		}
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	_setTexture(programEntry, name, texture, unit) {
		const gl = this.gl;
		const location = this._getUniformLocation(programEntry, name);
		if (location === null) return;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(location, unit);
	}

	_setUniform(programEntry, name, value, declaredType) {
		if (!name) return;
		const gl = this.gl;
		const location = this._getUniformLocation(programEntry, name);
		if (location === null) return;
		let type = programEntry.types.get(name);
		if (type === undefined) {
			type = inferUniformType(declaredType, value);
			programEntry.types.set(name, type);
		}
		const list = toNumberArray(value);
		const previous = programEntry.values.get(name);
		if (previous !== undefined && previous.length === list.length && arraysEqual(previous, list)) return;
		programEntry.values.set(name, list);
		if (type === 'int' || type === 'sampler2D' || type === 'bool') gl.uniform1i(location, list[0] || 0);
		else if (type === 'ivec2') gl.uniform2iv(location, list.slice(0, 2));
		else if (type === 'ivec3') gl.uniform3iv(location, list.slice(0, 3));
		else if (type === 'ivec4') gl.uniform4iv(location, list.slice(0, 4));
		else if (type === 'vec2') gl.uniform2fv(location, list.slice(0, 2));
		else if (type === 'vec3') gl.uniform3fv(location, list.slice(0, 3));
		else if (type === 'vec4') gl.uniform4fv(location, list.slice(0, 4));
		else if (type === 'mat3') gl.uniformMatrix3fv(location, false, list.slice(0, 9));
		else if (type === 'mat4') gl.uniformMatrix4fv(location, false, list.slice(0, 16));
		else gl.uniform1f(location, list[0] || 0);
	}

	_getUniformLocation(programEntry, name) {
		if (programEntry.uniforms.has(name)) return programEntry.uniforms.get(name);
		const location = this.gl.getUniformLocation(programEntry.program, name);
		programEntry.uniforms.set(name, location);
		return location;
	}

	_dispatchError(error) {
		const message = error instanceof Error ? error.message : String(error);
		this.canvas.dispatchEvent(new CustomEvent('siri-render-error', { detail: { message } }));
		console.error(message);
	}
}
