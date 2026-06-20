/**
 * [INPUT]: none (pure GLSL string module)
 * [OUTPUT]: VERTEX_SHADER — fullscreen-triangle vertex shader shared by every pass
 * [POS]: shaders/ 的公共顶点着色器；单三角覆盖全屏，无 VBO，靠 gl_VertexID 取顶点
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Fullscreen triangle — one oversized triangle instead of a quad, so there is
// no diagonal seam and no vertex buffer at all (positions indexed by ID).
// ============================================================================

export const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
	vec2(-1.0, -1.0),
	vec2(3.0, -1.0),
	vec2(-1.0, 3.0)
);

void main() {
	gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`;
