/**
 * [INPUT]: none (pure data module)
 * [OUTPUT]: WAVE_PRESETS、waveUniforms(surface, bands, preset)、dotsUniforms(surface, progress)
 * [POS]: shaders/ 的参数表；wave 有两套 preset（bloom/classic），dots 单套，调效果改这里
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// All tunable look parameters for the wave and dots passes live here.
//
// The wave shader is siriWaveCore — the SAME algorithm renders two looks:
//
//   bloom   : lush multi-lobe iOS wave (big amplitude, wide spectral
//             aberration, heavy band fill). Constants from aaaa-zhen's
//             IR-reconstruction (siri-glsl/siri-wave.html), uniform-mapped.
//   classic : the thin, subtle line as shipped on xiaolin.work/shaders/siri27
//             — byte-exact with the original site.
//
// Do not "fix" values by eye; a visual mismatch always has a root cause.
// ============================================================================

export const WAVE_PRESETS = {
	// aaaa-zhen siriWaveCore IR reconstruction → siri27 uniform space
	bloom: {
		audioScale: 1, // full-depth band modulation, like the reference demo
		uWhiteClip: 1, // channel clamp → hot cores bloom to white (soft)
		uUnresolvedScale: 0.14,
		// envelope dies at NDC ±1.11 × uWaveScale: 0.9 spans the whole sphere
		// (reference used 0.6 for a 420px card). Amplitude scaled down by the
		// same ratio so the on-screen wave height stays put.
		uAmplitude: 0.22,
		uFreq: 1.1,
		uAberrationFreq: 1,
		uWaveSpeed: -1,
		uWaveScale: 0.9,
		uAberration: 2.6,
		uThickness: 3,
		uIntensity: 2,
		uFalloff: 1.7,
		uEdgeMask: 0.4,
		uEdgeMaskInset: 0,
		uBandFill: 30000, // the translucent lobe body — this is what makes it "bloom"
		uBandFillThickness: 0.08,
		uSoftness: 2.5,
		uLowAmplitude: 6,
		uLowIntensity: 1.5,
		uMidAberration: 0.8,
		uMidAberrationAmplitude: 0.05,
		uMidBandFill: 0,
		uMidSoftness: 0.4,
		uHighAberration: 0.5,
		uHighAberrationAmplitude: 0.06,
	},
	// original xiaolin.work tuning
	classic: {
		audioScale: 0.4,
		uWhiteClip: 0, // hue-preserving guard, byte-exact with the site
		uUnresolvedScale: 0.05,
		uAmplitude: 0.125,
		uFreq: 1,
		uAberrationFreq: 1,
		uWaveSpeed: -1,
		uWaveScale: 1,
		uAberration: 0.5,
		uThickness: 8,
		uIntensity: 8,
		uFalloff: 2.025,
		uEdgeMask: 0,
		uEdgeMaskInset: 0,
		uBandFill: 0,
		uBandFillThickness: 0,
		uSoftness: 3,
		uLowAmplitude: 75,
		uLowIntensity: 0,
		uMidAberration: 5,
		uMidAberrationAmplitude: 0,
		uMidBandFill: 70,
		uMidSoftness: 0,
		uHighAberration: 5,
		uHighAberrationAmplitude: 0,
	},
};

export function waveUniforms(surface, bands, preset = WAVE_PRESETS.bloom, options = {}) {
	const { audioScale, ...uniformValues } = preset;
	return [
		{ name: 'uResolved', value: surface.sharedResolved },
		{ name: 'uLayerOpacity', value: surface.waveLayerOpacity },
		{ name: 'uEffectScale', value: surface.effectScale },
		{ name: 'uAnchor', type: 'vec2', value: [0.5, 0.5] },
		{ name: 'uWavePhase', value: surface.wavePhase },
		{ name: 'uLow', value: bands.low * audioScale },
		{ name: 'uMid', value: bands.mid * audioScale },
		{ name: 'uHigh', value: bands.high * audioScale },
		{ name: 'uMonoMode', value: options.monoMode ?? 0 },
		...Object.entries(uniformValues).map(([name, value]) => ({ name, value })),
	];
}

export function dotsUniforms(surface, progress) {
	return [
		{ name: 'uDotsResolved', value: surface.dotsResolved },
		{ name: 'uEffectScale', value: surface.effectScale },
		{ name: 'uAnchor', type: 'vec2', value: [0.5, 0.5] },
		{ name: 'uRotation', value: 0.7 },
		{ name: 'uRingRadius', value: 0.45 },
		{ name: 'uDotRadius', value: 0.1 },
		{ name: 'uPairOffset', value: 0.085 },
		{ name: 'uPairSmoothness', value: 0.2 },
		{ name: 'uSmoothness', value: 0.2 },
		{ name: 'uProgress0', value: progress[0].value },
		{ name: 'uProgress1', value: progress[1].value },
		{ name: 'uProgress2', value: progress[2].value },
		{ name: 'uProgress3', value: progress[3].value },
		{ name: 'uProgress4', value: progress[4].value },
		{ name: 'uProgress5', value: progress[5].value },
		{ name: 'uScaleDuration', value: 2 },
		{ name: 'uScaleStagger', value: 0.167 },
		{ name: 'uScaleMin', value: 0.001 },
		{ name: 'uScaleMax', value: 0.65 },
		{ name: 'uGlowIntensity', value: 0.04 },
		{ name: 'uFalloffPower', value: 0.7 },
		{ name: 'uGlowFadeStart', value: 0 },
		{ name: 'uGlowFadeEnd', value: 0.7 },
		{ name: 'uDotsAberration', value: -0.05 },
		{ name: 'uCenterCore', value: 0.5 },
		{ name: 'uDotsScale', value: 1 },
		{ name: 'uAppear', value: surface.dotsAppear },
		{ name: 'uGather', value: surface.gather },
		{ name: 'uCharge', value: surface.charge },
		{ name: 'uFlash', value: surface.flash },
	];
}
