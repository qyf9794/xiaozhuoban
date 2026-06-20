/**
 * [INPUT]: none (pure GLSL string module)
 * [OUTPUT]: EFFECT_COMPOSITE_FRAGMENT_SHADER — effect FBO → scene, with Dynamic-Island dark container
 * [POS]: shaders/ 的中间合成层；把 wave+dots 贴回场景并在其上方叠加纯黑→高斯衰减的暗容器
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Effect composite pass. Verbatim GLSL from the original siri27 bundle.
// Both inputs are premultiplied; "effect OVER container" is composed manually.
// ============================================================================

export const EFFECT_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uEffectTexture;
uniform vec2 uCanvasSize;
uniform vec2 uEffectOrigin;
uniform vec2 uEffectSize;
uniform float uContainer;        // dark-container strength (0 = off)
uniform float uContainerBlack;   // gy where the solid-black zone ends (= Dynamic-Island height)
uniform float uContainerFade;    // gaussian fade span below the black zone
uniform float uContainerGauss;   // gaussian falloff steepness
uniform vec3 uContainerTint;     // anger tint (deep wine red); mixed in by uAnger
uniform float uAnger;            // 0 = neutral black container, 1 = full anger tint

out vec4 outColor;

void main() {
	vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	vec2 effectUv = (pixel - uEffectOrigin) / uEffectSize;
	vec2 inRect = step(vec2(0.0), effectUv) * step(effectUv, vec2(1.0));
	if (inRect.x * inRect.y < 0.5) discard;

	// premultiplied effect (wave/dots = vec4(col, max(col)))
	vec4 effect = texture(uEffectTexture, vec2(effectUv.x, 1.0 - effectUv.y));

	// Dark container (premultiplied black = (0,0,0,a)). The top band — from the very top down to
	// the Dynamic-Island height (uContainerBlack) — is SOLID black (alpha=1) so it seamlessly
	// continues the hardware island's black. Below that it fades out with a GAUSSIAN falloff
	// (not linear) for a soft, eased transition into the scene.
	float gy = clamp(effectUv.y, 0.0, 1.0);
	float t = clamp((gy - uContainerBlack) / max(uContainerFade, 0.001), 0.0, 1.0);
	float vfade = (gy <= uContainerBlack) ? 1.0 : exp(-uContainerGauss * t * t); // solid black → gaussian fade
	float edgeLR = smoothstep(0.0, 0.14, min(effectUv.x, 1.0 - effectUv.x)); // soften left/right only
	float containerA = clamp(uContainer, 0.0, 1.0) * vfade * edgeLR;

	// container colour: neutral black, mixed toward the anger tint by uAnger.
	// gradient: the tint is strongest in the solid-black island band up top
	// and eases toward black as it fades down, so the red glows from the
	// crown and bleeds out — premultiplied, so rgb is colour × alpha.
	vec3 containerColor = mix(vec3(0.0), uContainerTint, clamp(uAnger, 0.0, 1.0) * vfade);

	// effect OVER container, both premultiplied
	float invEffectA = 1.0 - effect.a;
	vec3 outRGB = effect.rgb + containerColor * containerA * invEffectA;
	float outA = effect.a + containerA * invEffectA;
	outColor = vec4(outRGB, outA);
}
`;
