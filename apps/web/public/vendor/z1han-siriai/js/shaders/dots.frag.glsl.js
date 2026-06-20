/**
 * [INPUT]: none (pure GLSL string module)
 * [OUTPUT]: DOTS_FRAGMENT_SHADER — six-dot thinking ring pass (premultiplied RGBA)
 * [POS]: shaders/ 的六点环层；SDF smin 融合 + 12 步光谱色散，uProgress0..5 由 JS 弹簧驱动穿心翻转
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Dots pass. Verbatim GLSL from the original siri27 bundle (author: xiaolin).
// Same algorithm family as references/six-dot-ring-reference.glsl:
//   - 6 dots on a ring, each dot is a PAIR (centersA/B split by uPairOffset
//     along the tangent), fused with the polynomial smin (k*0.25 variant).
//   - Per-dot scale eases through a triangle wave whose cubic-bezier inverse
//     is solved by 8 Newton iterations in-shader (the k-loop).
//   - Spectral aberration: 12 samples, hue = spectrumTri(i * 4/11), each
//     sample's SDF shifted along the dot's radial direction by uDotsAberration.
//   - Glow: uGlowIntensity / pow(field, uFalloffPower), faded out between
//     uGlowFadeStart..uGlowFadeEnd with a smoothstep window.
//   - uProgress0..5 (JS springs, staggered) drive (1 - 2*progress) so each
//     dot travels through the center to the opposite side — the "flip".
// ============================================================================

export const DOTS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uMouse;

uniform float uDotsResolved;
uniform float uEffectScale;
uniform vec2 uAnchor;
uniform float uRotation;
uniform float uRingRadius;
uniform float uDotRadius;
uniform float uPairOffset;
uniform float uPairSmoothness;
uniform float uSmoothness;
uniform float uProgress0;
uniform float uProgress1;
uniform float uProgress2;
uniform float uProgress3;
uniform float uProgress4;
uniform float uProgress5;
uniform float uScaleDuration;
uniform float uScaleStagger;
uniform float uScaleMin;
uniform float uScaleMax;
uniform float uGlowIntensity;
uniform float uFalloffPower;
uniform float uGlowFadeStart;
uniform float uGlowFadeEnd;
uniform float uDotsAberration;
uniform float uCenterCore;
uniform float uDotsScale;
uniform float uAppear;
uniform float uGather;   // 0→1 pulls all dots into the center (conclude gesture)
uniform float uCharge;   // 0→1 shrinks + brightens the merged ball before the burst
uniform float uFlash;    // burst flash, 1 at release then exponential decay

out vec4 outColor;

float saturate(float value) {
	return clamp(value, 0.0, 1.0);
}

vec3 spectrumTri(float t) {
	return clamp(vec3(abs(t - 3.0) - 1.0, 2.0 - abs(t - 2.0), 2.0 - abs(t - 4.0)), 0.0, 1.0);
}

float progressAt(int index) {
	if (index == 0) return uProgress0;
	if (index == 1) return uProgress1;
	if (index == 2) return uProgress2;
	if (index == 3) return uProgress3;
	if (index == 4) return uProgress4;
	return uProgress5;
}

float dotsField(
	vec2 P,
	vec2 aberOff,
	vec2 centersA[6],
	vec2 centersB[6],
	vec2 dirs[6],
	float radii[6],
	bool psOn,
	bool smOn,
	float pairSmooth,
	float smoothness,
	float pairK,
	float smK
) {
	float field = 1.0e9;
	for (int j = 0; j < 6; j += 1) {
		vec2 ofs = aberOff * dirs[j];
		float lenA = length(P + ofs - centersA[j]);
		float lenB = length(P + ofs - centersB[j]);
		float dA = lenA - radii[j];
		float dB = lenB - radii[j];
		float dPair = min(dA, dB);
		if (psOn) {
			float h = max(pairSmooth - abs(lenA - lenB), 0.0) / pairSmooth;
			dPair = min(dA, dB) - h * h * pairK;
		}
		if (smOn) {
			float h2 = max(smoothness - abs(field - dPair), 0.0) / smoothness;
			field = min(field, dPair) - h2 * h2 * smK;
		} else {
			field = min(field, dPair);
		}
	}
	return field;
}

void main() {
	vec2 gid = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	float mn = min(uResolution.x, uResolution.y);
	float halfMn = mn * 0.5;
	vec2 anchorC = uAnchor - 0.5;
	float aspect2 = uResolution.x / halfMn;
	vec2 anchorShift = vec2(aspect2, 2.0) * anchorC;
	float pr = max(uDotsScale * uEffectScale, 0.001);
	float drive = mod(uTime, 62.831848) * uRotation;
	float scaleDur = max(uScaleDuration, 0.001);
	float appear = saturate(uAppear) * saturate(uDotsResolved);
	float ringAmp = appear * uRingRadius;
	float pairAmp = appear * uPairOffset;

	vec2 centersA[6];
	vec2 centersB[6];
	vec2 dirs[6];
	float radii[6];

	for (int i = 0; i < 6; i += 1) {
		float fi = float(i);
		float angle = fi * 1.0471976 + drive;
		float ca = cos(angle);
		float sa = sin(angle);
		vec2 perp = vec2(-sa, ca);
		float fr = fract((fi * uScaleStagger + uTime) / scaleDur);
		float tri = 1.0 - abs(fr * 2.0 - 1.0);
		float x = saturate(tri);
		for (int k = 0; k < 8; k += 1) {
			float omx = 1.0 - x;
			float a3 = omx * 3.0;
			float c126 = (omx * 0.42) * a3;
			float x2 = x * x;
			float deriv = (x2 * 1.26) + (x * 0.96) * omx + c126;
			if (abs(deriv) < 0.000001) break;
			float num = ((x2 * 0.58) * a3 - tri) + (c126 + x2) * x;
			x = saturate(x - num / deriv);
		}
		float ss = x * x * (3.0 - 2.0 * x);
		float amp = mix(uScaleMin, uScaleMax, ss);
		// gather: every dot converges to a uniform mid-size at the center;
		// uGather is fed UNCLAMPED so the burst spring's overshoot below 0
		// extrapolates the mix — flinging dots outward past the ring
		amp = mix(amp, 0.45, uGather) * (1.0 - 0.18 * saturate(uCharge));
		vec2 dir = vec2(ca, sa);
		vec2 base = (ringAmp * dir) * (1.0 - 2.0 * progressAt(i));
		base = mix(base, dir * 0.008, uGather);
		float ph2 = pairAmp * amp * (1.0 - uGather);
		centersA[i] = base - ph2 * perp;
		centersB[i] = base + ph2 * perp;
		dirs[i] = dir;
		radii[i] = amp * uDotRadius;
	}

	vec2 uvPix = (gid + 0.5 - 0.5 * uResolution) / halfMn;
	vec2 P = (uvPix - anchorShift) / pr;
	bool psOn = uPairSmoothness > 0.0001;
	bool smOn = uSmoothness > 0.0001;
	float fadeRange = max(uGlowFadeEnd - uGlowFadeStart, 0.0001);
	float aberStep = uDotsAberration * 0.0909090936;
	vec3 colAcc = vec3(0.0);
	vec3 wSum = vec3(0.0);

	for (int i = 0; i < 12; i += 1) {
		float ti = float(i) * 0.363636374;
		vec3 hue = spectrumTri(ti);
		vec2 aberOff = vec2(-(aberStep * float(i)));
		float field = dotsField(
			P,
			aberOff,
			centersA,
			centersB,
			dirs,
			radii,
			psOn,
			smOn,
			uPairSmoothness,
			uSmoothness,
			uPairSmoothness * 0.25,
			uSmoothness * 0.25
		);
		float fm = max(field, 0.0);
		float glow = saturate(uGlowIntensity / pow(fm + 0.0001, uFalloffPower));
		float fadeT = clamp((fm - uGlowFadeStart) / fadeRange, 0.0, 1.0);
		float fade = 1.0 - fadeT * fadeT * (3.0 - 2.0 * fadeT);
		colAcc += hue * (fade * glow);
		wSum += hue;
	}

	float cfield = dotsField(
		P,
		vec2(0.0),
		centersA,
		centersB,
		dirs,
		radii,
		psOn,
		smOn,
		uPairSmoothness,
		uSmoothness,
		uPairSmoothness * 0.25,
		uSmoothness * 0.25
	);
	vec3 col = colAcc / max(wSum, vec3(0.0001));
	float cfm = max(cfield, 0.0);
	float cglow = saturate(uGlowIntensity / pow(cfm + 0.0001, uFalloffPower));
	float cfadeT = clamp((cfm - uGlowFadeStart) / fadeRange, 0.0, 1.0);
	float cfade = 1.0 - cfadeT * cfadeT * (3.0 - 2.0 * cfadeT);
	vec2 mouseUv = uMouse.xy / max(uResolution, vec2(1.0));
	float mouseBoost = 1.0 + uMouse.z * 0.35 + uMouse.w * 0.2 + smoothstep(0.0, 0.16, 1.0 - distance(mouseUv, vec2(0.5))) * 0.05;

	col = (col + (cglow * uCenterCore) * cfade) * appear * mouseBoost;
	// conclude brightness: slight dim while merged (smin does not stack), then
	// charge glow ramps up and the burst flash spikes on release
	col *= mix(1.0, 0.85, saturate(uGather)) * (1.0 + 0.35 * saturate(uCharge) + 1.2 * uFlash);
	// hue-preserving clip guard: scale down only when over 1 (max→1), keeping the dot's hue.
	float m = max(max(col.r, col.g), col.b);
	col *= (m > 1.0) ? (1.0 / m) : 1.0;
	float alpha = saturate(max(max(col.r, col.g), col.b));
	outColor = vec4(col, alpha);
}
`;
