/**
 * [INPUT]: 依赖 ./spring.js 的 Spring
 * [OUTPUT]: createSiriState() — idle/listening/thinking 状态机，输出 surface + progress 供 renderer 消费
 * [POS]: js/ 的编排中枢；所有"什么时候动、动多快"都在这里，renderer 只管画
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// ============================================================================
// Interaction state machine.
//
//   idle      : wave visible (white line), dots hidden
//   listening : wave visible (colored, audio-driven), dots hidden
//   thinking  : wave hidden, dots visible; every 5s the six progress springs
//               flip 0↔1 with a 0.2s stagger, sending each dot through the
//               center (the "thinking pulse")
//
// Two motion systems coexist deliberately:
//   - Spring (closed-form) for scalar fades: waveOpacity, dotsAppear, press
//   - a fixed-substep Euler sim (stiffness 400 / damping 40, dt ≤ 1/30) for
//     {fluidDots, effectScale}, matching the original's integrator exactly
// ============================================================================

import { Spring } from './spring.js';

const EXPANDED_WIDTH = 128; // CSS px, pre-DPR core size of the glass panel

const WAVE_IN_SPRING = { response: 0.314, dampingRatio: 1 };
const WAVE_OUT_SPRING = { response: 0.3, dampingRatio: 1 };
const PRESS_SPRING = { response: 0.28, dampingRatio: 1 };
const DOTS_APPEAR_SPRING = { response: 0.314, dampingRatio: 1 };
const PROGRESS_SPRING = { duration: 0.9, bounce: 0.55 };

const PROGRESS_STAGGER_S = 0.2; // delay between consecutive dots on a flip
const FLIP_INTERVAL_S = 2.5; // thinking pulse period; springs settle in ~1.4s

// conclude (gather → charge → burst), the thinking exit gesture.
// Spring shapes mirror the reference choreography: critically damped pull-in
// (settleCrit) and a bouncy underdamped release (settleWL).
const CONCLUDE_GATHER_S = 0.6; // pull-in duration before charging
const CONCLUDE_CHARGE_S = 0.3; // held at center, shrinking + brightening
const GATHER_IN_SPRING = { response: 0.5, dampingRatio: 1 };
const GATHER_BURST_SPRING = { duration: 0.55, bounce: 0.5 };
const CHARGE_SPRING = { response: 0.18, dampingRatio: 1 };
const FLASH_DECAY = 7; // exp falloff per second, matches the reference
const SIM_MAX_STEP_S = 1 / 30;
const WAVE_PHASE_WRAP = 62.831848; // ~10 * TAU, matches mod() in the shader
const WAVE_SPEED_BASE = -1.35;
const WAVE_SPEED_AUDIO = -5.5; // extra phase speed at full audio drive
const AUDIO_DRIVE_SCALE = 0.4;

const STATE_PRESETS = {
	idle: { waveActive: true, fluidDotsActive: false },
	listening: { waveActive: true, fluidDotsActive: false },
	thinking: { waveActive: false, fluidDotsActive: true },
	answer: { waveActive: false, fluidDotsActive: false }, // glass pill with text
};

// circle ↔ pill morph, slightly underdamped so the pill lands with a breath
const ANSWER_SPRING = { response: 0.5, dampingRatio: 0.8 };

function zeroVelocity() {
	return { fluidDots: 0, effectScale: 0 };
}

function targetsFor(preset) {
	return {
		fluidDots: preset.fluidDotsActive ? 1 : -1,
		effectScale: preset.fluidDotsActive ? 2 / 3 : 1,
	};
}

// Semi-implicit Euler with capped substeps — kept verbatim from the original
// (an analytic spring here would settle on a slightly different curve).
function integrateFluidSim(sim, dt) {
	let remaining = Math.min(Math.max(dt, 0), 0.1);
	while (remaining > 0) {
		const step = Math.min(remaining, SIM_MAX_STEP_S);
		for (const key of ['fluidDots', 'effectScale']) {
			const accel = (sim.current[key] - sim.target[key]) * -400 + sim.velocity[key] * -40;
			sim.velocity[key] += accel * step;
			sim.current[key] += sim.velocity[key] * step;
		}
		remaining -= step;
	}
}

function applySimToSurface(surface, current) {
	surface.dotsResolved = current.fluidDots;
	surface.effectScale = current.effectScale;
	surface.waveResolved = surface.waveOpacity * 2 - 1;
	surface.sharedResolved = Math.max(surface.waveResolved, surface.dotsResolved, 0);
	surface.waveLayerOpacity = 0.98 * Math.min(1, Math.max(0, surface.waveOpacity));
}

function audioDrive(bands) {
	if (!bands) return 0;
	return Math.max(0, Math.min(1, Math.max(bands.low || 0, bands.mid || 0, bands.high || 0) * AUDIO_DRIVE_SCALE));
}

function advanceWavePhase(surface, dt, bands) {
	const speed = WAVE_SPEED_BASE + WAVE_SPEED_AUDIO * audioDrive(bands);
	surface.wavePhase = (surface.wavePhase + speed * dt) % WAVE_PHASE_WRAP;
	if (surface.wavePhase < 0) surface.wavePhase += WAVE_PHASE_WRAP;
}

export function createSiriState() {
	const initialTargets = targetsFor(STATE_PRESETS.idle);

	const surface = {
		waveOpacity: 0,
		wavePhase: 0,
		waveResolved: -1,
		sharedResolved: 0,
		dotsAppear: 0,
		dotsResolved: initialTargets.fluidDots,
		effectScale: initialTargets.effectScale,
		waveLayerOpacity: 0,
		press: 0,
		gather: 0,
		charge: 0,
		flash: 0,
		answer: 0,
	};

	const springs = {
		waveOpacity: new Spring(surface.waveOpacity, WAVE_IN_SPRING),
		dotsAppear: new Spring(surface.dotsAppear, DOTS_APPEAR_SPRING),
		press: new Spring(surface.press, PRESS_SPRING),
	};

	const sim = {
		current: { ...initialTargets },
		velocity: zeroVelocity(),
		target: { ...initialTargets },
	};

	const progress = Array.from({ length: 6 }, () => ({ value: 0 }));
	const progressSprings = progress.map(() => new Spring(0, PROGRESS_SPRING));

	let state = 'idle';
	let flipTarget = 0;
	let prevFlipTarget = 0;
	let thinkTimer = 0;
	let timeSinceFlip = Number.POSITIVE_INFINITY;

	const gatherSpring = new Spring(0, GATHER_IN_SPRING);
	const chargeSpring = new Spring(0, CHARGE_SPRING);
	const answerSpring = new Spring(0, ANSWER_SPRING);
	let concludePhase = null; // null | 'gather' | 'charge'
	let concludeTimer = 0;
	let flashValue = 0;

	function flip() {
		prevFlipTarget = flipTarget;
		flipTarget = flipTarget > 0.5 ? 0 : 1;
		timeSinceFlip = 0;
	}

	function resetFlip() {
		prevFlipTarget = 0;
		flipTarget = 0;
		thinkTimer = 0;
		timeSinceFlip = Number.POSITIVE_INFINITY;
		for (const spring of progressSprings) spring.setTarget(0, PROGRESS_SPRING);
	}

	function resetConclude() {
		concludePhase = null;
		concludeTimer = 0;
		flashValue = 0;
		gatherSpring.jump(0);
		gatherSpring.setOptions(GATHER_IN_SPRING);
		chargeSpring.jump(0);
	}

	return {
		// one pill size for ask AND reply — input + suggestion chips live inside
		// the glass, so the pill is tall enough for both and never re-morphs
		sizes: { expanded: { width: EXPANDED_WIDTH }, answer: { width: 460, height: 150 } },
		surface,
		progress,
		get state() {
			return state;
		},

		select(name) {
			const preset = STATE_PRESETS[name];
			if (!preset) return;
			const targets = targetsFor(preset);
			const targetsChanged =
				sim.target.fluidDots !== targets.fluidDots || sim.target.effectScale !== targets.effectScale;
			state = name;
			thinkTimer = 0;
			springs.waveOpacity.setTarget(preset.waveActive ? 1 : 0, preset.waveActive ? WAVE_IN_SPRING : WAVE_OUT_SPRING);
			sim.target = targets;
			if (targetsChanged) sim.velocity = zeroVelocity();
			if (name !== 'thinking') resetFlip();
			// entering idle/answer must NOT reset the conclude springs — the
			// burst bounce and flash decay play out OVER that transition
			if (name === 'listening' || name === 'thinking') resetConclude();
			answerSpring.setTarget(name === 'answer' ? 1 : 0, ANSWER_SPRING);
		},

		// Thinking exit gesture: gather → charge → burst. Returns the delay in
		// ms after which the caller should switch to idle (the burst moment),
		// so the flash covers the dots→wave crossfade. 0 = not in thinking.
		conclude() {
			if (state !== 'thinking' || concludePhase) return 0;
			concludePhase = 'gather';
			concludeTimer = 0;
			thinkTimer = 0;
			gatherSpring.setTarget(1, GATHER_IN_SPRING);
			return Math.round((CONCLUDE_GATHER_S + CONCLUDE_CHARGE_S) * 1000);
		},

		setPressed(pressed) {
			springs.press.setTarget(pressed ? 1 : 0, PRESS_SPRING);
		},

		tick(dt, bands) {
			surface.waveOpacity = springs.waveOpacity.step(dt);
			surface.press = springs.press.step(dt);
			integrateFluidSim(sim, dt);
			applySimToSurface(surface, sim.current);
			advanceWavePhase(surface, dt, bands);

			springs.dotsAppear.setTarget(Math.max(surface.dotsResolved, 0), DOTS_APPEAR_SPRING);
			surface.dotsAppear = springs.dotsAppear.step(dt);

			// conclude timeline: gather pull-in → charge hold → burst release
			if (concludePhase) {
				concludeTimer += dt;
				if (concludePhase === 'gather' && concludeTimer >= CONCLUDE_GATHER_S) {
					concludePhase = 'charge';
					chargeSpring.setTarget(1, CHARGE_SPRING);
				} else if (concludePhase === 'charge' && concludeTimer >= CONCLUDE_GATHER_S + CONCLUDE_CHARGE_S) {
					concludePhase = null; // burst: springs run free from here
					flashValue = 1;
					gatherSpring.setTarget(0, GATHER_BURST_SPRING); // bouncy release, overshoots < 0
					chargeSpring.jump(0);
				}
			}
			surface.gather = gatherSpring.step(dt); // unclamped: overshoot = outward fling
			surface.charge = chargeSpring.step(dt);
			surface.answer = answerSpring.step(dt);
			flashValue *= Math.exp(-FLASH_DECAY * dt);
			if (flashValue < 0.001) flashValue = 0;
			surface.flash = flashValue;

			if (state === 'thinking' && surface.dotsResolved > 0) {
				if (!concludePhase) thinkTimer += dt; // flips pause while concluding
				if (thinkTimer >= FLIP_INTERVAL_S) {
					thinkTimer = 0;
					flip();
				}
			} else {
				resetFlip();
			}

			timeSinceFlip += dt;
			for (let i = 0; i < progressSprings.length; i += 1) {
				// dots whose stagger delay has not elapsed yet keep chasing the
				// previous flip value — that is what makes the pulse ripple
				const target = i * PROGRESS_STAGGER_S > timeSinceFlip ? prevFlipTarget : flipTarget;
				progressSprings[i].setTarget(target, PROGRESS_SPRING);
				progress[i].value = progressSprings[i].step(dt);
			}
		},
	};
}
