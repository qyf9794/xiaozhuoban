/**
 * [INPUT]: none (pure math module)
 * [OUTPUT]: Spring class — analytic damped-spring animator ({response,dampingRatio} or {duration,bounce})
 * [POS]: js/ 的运动基元；audio-analyzer 和 state 的所有平滑/过冲动画都建立在它之上
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Analytic spring solver (closed-form, not Euler) — exact for any dt, which
// is why transitions stay stable even with tab-throttled frames.
// Two option vocabularies, matching SwiftUI's spring API:
//   {response, dampingRatio}  — period-based
//   {duration, bounce}        — bounce > 0 gives overshoot
// ============================================================================

const TAU = Math.PI * 2;
const MASS = 1;
const MIN_RESPONSE = 1e-4;

function paramsFromResponse({ response, dampingRatio }) {
	const safeResponse = Math.max(response, MIN_RESPONSE);
	const ratio = Math.max(0, dampingRatio);
	const omega = TAU / safeResponse;
	const stiffness = MASS * omega * omega;
	const damping = 2 * ratio * MASS * omega;
	return { mass: MASS, stiffness, damping, naturalAngularFrequency: omega };
}

function paramsFromDuration({ duration, bounce }) {
	return paramsFromResponse({
		response: duration,
		dampingRatio: Math.max(0.05, 1 - Math.max(0, bounce)),
	});
}

function normalizeOptions(options) {
	if ('stiffness' in options && 'damping' in options) {
		const mass = options.mass || MASS;
		const omega = Math.sqrt(options.stiffness / mass);
		return {
			mass,
			stiffness: options.stiffness,
			damping: options.damping,
			naturalAngularFrequency: omega,
		};
	}
	if ('duration' in options && 'bounce' in options) return paramsFromDuration(options);
	return paramsFromResponse(options);
}

// Closed-form step: solves the damped harmonic oscillator for displacement
// (value - target) over dt, handling under/over/critically damped branches.
function stepSpring(value, velocity, target, params, dt) {
	const omegaSq = params.stiffness / params.mass;
	const omega = params.naturalAngularFrequency;
	const decay = params.damping / (2 * params.mass);
	const t = Math.max(dt, 0);
	const x0 = value - target;

	if (t <= 0 || (x0 === 0 && velocity === 0)) return [value, velocity];

	let x;
	let v;
	if (decay < omega) {
		// underdamped: decaying oscillation
		const wd = Math.sqrt(omegaSq - decay * decay);
		const envelope = Math.exp(-decay * t);
		const cos = Math.cos(wd * t);
		const sin = Math.sin(wd * t);
		const a = x0;
		const b = (velocity + decay * x0) / wd;
		const disp = a * cos + b * sin;
		x = envelope * disp;
		v = envelope * (-decay * disp + (-a * wd * sin + b * wd * cos));
	} else if (omega < decay) {
		// overdamped: sum of two exponentials
		const wd = Math.sqrt(decay * decay - omegaSq);
		const r1 = -decay + wd;
		const r2 = -decay - wd;
		const a = (velocity - r2 * x0) / (r1 - r2);
		const b = x0 - a;
		const e1 = Math.exp(r1 * t);
		const e2 = Math.exp(r2 * t);
		x = a * e1 + b * e2;
		v = a * r1 * e1 + b * r2 * e2;
	} else {
		// critically damped
		const envelope = Math.exp(-decay * t);
		const c = velocity + decay * x0;
		const disp = x0 + c * t;
		x = envelope * disp;
		v = envelope * (c - decay * disp);
	}
	return [target + x, v];
}

export class Spring {
	constructor(value, options) {
		this.value = value;
		this.velocity = 0;
		this.target = value;
		this.parameters = normalizeOptions(options);
	}

	setOptions(options) {
		this.parameters = normalizeOptions(options);
	}

	setTarget(target, options) {
		if (options) this.setOptions(options);
		this.target = target;
	}

	jump(value) {
		this.value = value;
		this.velocity = 0;
		this.target = value;
	}

	step(dt) {
		[this.value, this.velocity] = stepSpring(this.value, this.velocity, this.target, this.parameters, dt);
		return this.value;
	}
}
