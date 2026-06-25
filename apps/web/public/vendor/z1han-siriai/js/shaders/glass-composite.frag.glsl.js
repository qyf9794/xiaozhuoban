/**
 * [INPUT]: none (pure GLSL string module)
 * [OUTPUT]: GLASS_COMPOSITE_FRAGMENT_SHADER — final pass: glass panel refraction + highlights over photo
 * [POS]: shaders/ 的最终合成层；超椭圆 SDF 面板、圆弧折射 profile、key/fill 双向边缘高光
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Glass composite pass. Verbatim GLSL from the original siri27 bundle.
//   - supercircleDistance: superellipse (squircle) SDF with a polynomial
//     corner approximation; cornerParam blends square ↔ circle per axis.
//   - refractedUv: displaces the scene sample along the SDF gradient with a
//     circular-arc height profile (uCurvature 0 = flat bevel, 1 = sphere).
//   - highlightBand: two angular lobes (key + fill light) hugging the rim.
//   - Outside the panel the raw photo shows, so the dark container never
//     spills past the glass.
// ============================================================================

export const GLASS_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uSceneTexture;
uniform sampler2D uBackground;
uniform float uTime;

uniform vec2 uTextureSize;
uniform vec2 uPanelSize;
uniform vec2 uCanvasSize;
uniform vec2 uPanelOrigin;
uniform float uMarginPx;
uniform float uCornerRadius;

uniform float uHeight;
uniform float uCurvature;
uniform float uRefractAmount;
uniform float uAngle;
uniform float uGradRadialMix;

uniform float uKeyAngle;
uniform float uFillAngle;
uniform float uHlHeight;
uniform float uHlCut;
uniform float uHlNorm;
uniform float uHlAmount;
uniform float uHlCurv;

uniform float uBackgroundReady;
uniform float uTransparentOutside; // 0 = framed page (photo fills canvas), 1 = embedded (outside the panel is transparent)

// chip lenses: small glass capsules INSIDE the panel (the suggestion buttons).
// DOM supplies text + hit area; the glass material is rendered here, as a
// second refraction with its own rim highlight. xy = center offset from the
// panel center (device px), zw = half size. State 0 hides a chip entirely.
uniform vec4 uChip0;
uniform vec4 uChip1;
uniform vec4 uChip2;
uniform vec3 uChipState;
uniform vec3 uChipHover; // per-chip hover 0..1 — the lens brightens, no CSS fill
uniform float uChipRefract;
uniform float uChipHeight;
uniform float uChipHlAmount;
uniform float uChipFace; // translucent white face on the chip body

out vec4 outColor;

float saturate(float x) {
	return clamp(x, 0.0, 1.0);
}

vec2 rotate2d(vec2 v, float a) {
	float c = cos(a);
	float s = sin(a);
	return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

vec2 coverUv(vec2 canvasUv) {
	vec2 pixel = canvasUv * uCanvasSize;
	float cover = max(uCanvasSize.x / uTextureSize.x, uCanvasSize.y / uTextureSize.y);
	vec2 fitted = uTextureSize * cover;
	vec2 offset = (fitted - uCanvasSize) * 0.5;
	return clamp((pixel + offset) / fitted, vec2(0.0), vec2(1.0));
}

vec3 fallbackBackground(vec2 uv) {
	float vignette = smoothstep(0.95, 0.12, distance(uv, vec2(0.5)));
	vec3 top = vec3(0.015, 0.018, 0.022);
	vec3 bottom = vec3(0.0, 0.0, 0.0);
	return mix(bottom, top, 1.0 - uv.y) + vec3(0.02, 0.035, 0.055) * vignette;
}

vec3 sampleBackground(vec2 canvasUv) {
	vec3 image = texture(uBackground, coverUv(canvasUv)).rgb;
	return mix(fallbackBackground(canvasUv), image, clamp(uBackgroundReady, 0.0, 1.0));
}

vec3 sampleScene(vec2 canvasUv) {
	return texture(uSceneTexture, vec2(canvasUv.x, 1.0 - canvasUv.y)).rgb;
}

float supercircleDistance(vec2 p, vec2 b, float n, vec2 param) {
	const float c = 1.528665;
	float an = abs(n);
	float ac = an * c;
	float m10 = mix(ac, an, max(param.x, param.y));
	vec2 v14 = (p - b) + vec2(m10);
	vec2 q = abs(max(vec2(0.0), (p - b) / max(ac, 0.0001) + vec2(1.0)));
	float l = length(q);
	float qmax = max(q.x, q.y);
	float qmin = min(q.x, q.y);
	float ratio = (qmax == 0.0) ? 0.0 : saturate(qmin / qmax);
	float poly = ((((-0.926054 * ratio + 3.15601) * ratio - 3.64122) * ratio + 1.26803) * ratio + 0.268531);
	float dCorner = (l + 1.0) - 1.0 / (1.0 - ratio * ratio * saturate(l) * poly);
	float dFar = length(max(vec2(0.0), q * c - vec2(0.528665))) * 0.654166 + 0.345834;
	float d57 = mix(dCorner, dFar, param.x);
	float d58 = mix(dCorner, dFar, param.y);
	float s = (q.y > q.x) ? 1.0 : -1.0;
	float t65 = saturate((0.5 - s) + s * ratio);
	float dist = mix(d57, d58, t65) - 1.0;
	float emin = min(max(v14.x, v14.y), 0.0);
	return emin + ac * dist;
}

vec2 cornerParam(vec2 halfSize, float r) {
	if (r < 0.0001) return vec2(0.0);
	return clamp((vec2(1.528665) - halfSize / r) / 0.528665, vec2(0.0), vec2(1.0));
}

float shapeDistance(vec2 p, vec2 halfSize, float cornerRadius) {
	float r = min(cornerRadius, min(halfSize.x, halfSize.y));
	if (r < 0.5) {
		vec2 dd = abs(p) - halfSize;
		return length(max(dd, vec2(0.0))) + min(max(dd.x, dd.y), 0.0);
	}
	return supercircleDistance(abs(p), halfSize, r, cornerParam(halfSize, r));
}

vec2 shapeGradient(vec2 p, vec2 halfSize, float cornerRadius, float radialMix) {
	float r = min(cornerRadius, min(halfSize.x, halfSize.y));
	vec2 param = cornerParam(halfSize, r);
	float ac = mix(r * 1.528665, r, max(param.x, param.y));
	vec2 pf = abs(p);
	vec2 v = max(vec2(0.0), (pf - halfSize) + vec2(ac));
	vec2 g = (v.x + v.y > 0.00001)
		? normalize(v)
		: ((pf.x - halfSize.x > pf.y - halfSize.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
	vec2 cornerGrad = g * sign(p);
	vec2 centerRadial = normalize(vec2(p.x, halfSize.x * p.y / max(halfSize.y, 0.001)) + vec2(0.00001));
	return normalize(mix(cornerGrad, centerRadial, radialMix));
}

float refractionProfile(float t, float curvature) {
	float flatProfile = 1.0 - 0.2929 * (t < 1.0 ? 1.0 : 0.0);
	float circular = sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0));
	return mix(flatProfile, circular, curvature);
}

vec2 refractedUv(vec2 baseUv, float d, vec2 grad) {
	float t = clamp(-d / max(uHeight, 0.001), 0.0, 1.0);
	float mag = 1.0 - refractionProfile(t, uCurvature);
	vec2 dir = rotate2d(grad, uAngle);
	return baseUv + (uRefractAmount * mag * dir) / uCanvasSize;
}

float highlightLobe(float dist, float aa, vec2 n, float h, vec2 dir, float cut, float curv) {
	if (dist < -5.0) return 0.0;
	float t = saturate(dist / max(h, 0.001));
	float profile = mix(t < 1.0 ? 1.0 : 0.0, 1.0 - t, curv);
	float band = saturate(dist / aa + 0.5) * saturate((h - dist) / aa + 0.5) * profile;
	float angular = saturate((dot(dir, n) - cut) / max(1.0 - cut, 0.001));
	return band * angular;
}

float highlightBand(float d, vec2 grad) {
	float glen = max(length(grad), 0.0001);
	float dist = -d / glen;
	vec2 n = grad / glen;
	float aa = max(fwidth(dist), 0.0001);
	vec2 kdir = vec2(cos(uKeyAngle), sin(uKeyAngle));
	vec2 fdir = vec2(cos(uFillAngle), sin(uFillAngle));
	float key = highlightLobe(dist, aa, n, uHlHeight, kdir, uHlCut, uHlCurv);
	float fill = highlightLobe(dist, aa, n, uHlHeight, fdir, uHlCut, uHlCurv);
	float keyN = key / (1.0 + (1.0 - key) * uHlNorm);
	float fillN = fill / (1.0 + (1.0 - fill) * uHlNorm);
	return keyN + fillN;
}

float orbWaveBoundary(vec2 normalizedPanel) {
	float x = clamp(normalizedPanel.x, -1.0, 1.0);
	float envelope = pow(max(cos(min(abs(x) * 0.92, 1.0) * 1.5707964), 0.0), 2.0);
	float primary = sin(x * 3.35 - uTime * 1.55);
	float secondary = sin(x * 6.7 + uTime * 0.72 + 1.1) * 0.32;
	return (primary + secondary) * envelope * 0.07;
}

vec4 glassFragment(vec2 pixel) {
	vec2 panelUv = (pixel - uPanelOrigin) / uPanelSize;
	vec2 inQuad = step(vec2(0.0), panelUv) * step(panelUv, vec2(1.0));
	if (inQuad.x * inQuad.y < 0.5) return vec4(0.0);

	vec2 halfSize = uPanelSize * 0.5 - vec2(uMarginPx);
	vec2 p = (panelUv - vec2(0.5)) * uPanelSize;
	float d = shapeDistance(p, halfSize, uCornerRadius);
	float alpha = 1.0 - smoothstep(-1.0, 1.0, d);
	if (alpha <= 0.001) return vec4(0.0);

	vec2 grad = shapeGradient(p, halfSize, uCornerRadius, uGradRadialMix);
	vec2 baseUv = (uPanelOrigin + panelUv * uPanelSize) / uCanvasSize;
	vec2 rUv = clamp(refractedUv(baseUv, d, grad), vec2(0.0), vec2(1.0));

	vec2 normalizedPanel = p / max(halfSize, vec2(1.0));
	float waveBoundary = orbWaveBoundary(normalizedPanel);

	vec3 col = sampleScene(rUv);
	float sceneLight = max(max(col.r, col.g), col.b);
	float waveProtect = smoothstep(0.035, 0.42, sceneLight);
	float waveBandProtect = 1.0 - smoothstep(0.04, 0.34, abs(normalizedPanel.y - waveBoundary));
	float upperBlack = 1.0 - smoothstep(-0.08, 0.82, normalizedPanel.y);
	col = mix(col, vec3(0.0), clamp(upperBlack * (1.0 - max(waveProtect, waveBandProtect) * 0.96), 0.0, 1.0));
	col += vec3(highlightBand(d, grad) * uHlAmount);

	// Inner rim reflections: a warm key lobe across the upper glass edge and a
	// cooler blue return lobe near the lower edge, matching the mobile Siri view.
	float radial = length(normalizedPanel);
	float innerRim = smoothstep(0.62, 0.92, radial) * (1.0 - smoothstep(0.98, 1.06, radial)) * alpha;
	float upperLobe = (1.0 - smoothstep(-0.54, 0.04, normalizedPanel.y)) * smoothstep(-0.96, -0.18, normalizedPanel.x + 0.26);
	float lowerLobe = smoothstep(0.08, 0.78, normalizedPanel.y) * (1.0 - smoothstep(0.2, 1.0, abs(normalizedPanel.x)));
	float sideLobe = smoothstep(0.72, 0.98, abs(normalizedPanel.x)) * (1.0 - smoothstep(-0.1, 0.78, normalizedPanel.y));
	vec3 innerRimColor =
		vec3(1.0, 0.82, 0.42) * upperLobe * 0.72 +
		vec3(0.22, 0.44, 1.0) * lowerLobe * 0.54 +
		vec3(0.64, 0.74, 1.0) * sideLobe * 0.34;
	col += innerRimColor * innerRim;
	float innerEdgeLine = smoothstep(0.74, 0.9, radial) * (1.0 - smoothstep(0.92, 0.99, radial)) * alpha;
	col += vec3(0.42, 0.52, 0.86) * innerEdgeLine * 0.22;

	// chip lenses: glass-on-glass. Each capsule refracts the already-refracted
	// scene a second time and wears its own rim highlight + a faint face lift.
	vec4 chips[3] = vec4[3](uChip0, uChip1, uChip2);
	for (int i = 0; i < 3; i++) {
		float on = uChipState[i];
		vec4 chip = chips[i];
		if (on <= 0.001 || chip.z <= 0.5) continue;
		vec2 cp = p - chip.xy;
		float cr = min(chip.z, chip.w);
		float cd = shapeDistance(cp, chip.zw, cr);
		float ca = (1.0 - smoothstep(-1.0, 1.0, cd)) * on;
		if (ca <= 0.001) continue;
		vec2 cgrad = shapeGradient(cp, chip.zw, cr, 0.35);
		float t = clamp(-cd / max(uChipHeight, 0.001), 0.0, 1.0);
		float mag = 1.0 - refractionProfile(t, 1.0);
		vec2 cUv = clamp(rUv + (uChipRefract * mag * cgrad) / uCanvasSize, vec2(0.0), vec2(1.0));
		// hover whitens the face ONLY (0.10 → 0.25 toward white) — a fixed
		// additive tweak would drown in the scene's own luminance variance,
		// and any geometry change (scale) sweeps the refraction ring around
		float hov = uChipHover[i];
		vec3 chipCol = sampleScene(cUv);
		chipCol = mix(chipCol, vec3(1.0), uChipFace * (1.0 + 1.5 * hov));
		chipCol += vec3(highlightBand(cd, cgrad) * uChipHlAmount);
		col = mix(col, chipCol, ca);
	}
	float embedded = clamp(uTransparentOutside, 0.0, 1.0);
	float aboveWave = 1.0 - smoothstep(waveBoundary - 0.035, waveBoundary + 0.035, normalizedPanel.y);
	float embeddedFade = 1.0 - smoothstep(waveBoundary + 0.02, 1.0, normalizedPanel.y);
	embeddedFade = mix(embeddedFade, 1.0, aboveWave);
	float embeddedAlpha = alpha * embeddedFade;
	return vec4(col, mix(alpha, embeddedAlpha, embedded));
}

void main() {
	vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	vec2 canvasUv = pixel / uCanvasSize;
	// outside the glass: original photo (so the dark container stays INSIDE the glass and never
	// spills past it). The container + wave/dots live in the scene and are only seen refracted inside.
	vec3 background = sampleBackground(canvasUv);
	vec4 glass = glassFragment(pixel);
	float a = saturate(glass.a);
	vec3 glassRgb = clamp(glass.rgb, 0.0, 1.25);
	// framed: the photo fills the canvas around the panel (standalone page)
	vec4 framed = vec4(mix(background, glassRgb, a), 1.0);
	// floating: premultiplied glass over transparency (embedded in a host page,
	// which supplies the real backdrop behind the canvas)
	vec4 floating = vec4(glassRgb * a, a);
	outColor = mix(framed, floating, clamp(uTransparentOutside, 0.0, 1.0));
}
`;
