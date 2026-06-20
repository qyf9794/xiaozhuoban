const FFT_SIZE = 1024;
const FFT_HALF = FFT_SIZE / 2;
const SPECTRUM_HOP_SIZE = 512;
const LOW_MID_SPLIT_HZ = 500;
const MID_HIGH_SPLIT_HZ = 3000;
const PEAK_FLOOR = 8e-4;
const PEAK_DECAY = 0.9975;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function makeHanningWindow() {
	const values = new Float32Array(FFT_SIZE);
	for (let i = 0; i < FFT_SIZE; i += 1) {
		values[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
	}
	return values;
}

function makeBitReverseTable() {
	const table = new Uint16Array(FFT_SIZE);
	const bits = Math.log2(FFT_SIZE);
	for (let i = 0; i < FFT_SIZE; i += 1) {
		let value = i;
		let reversed = 0;
		for (let bit = 0; bit < bits; bit += 1) {
			reversed = (reversed << 1) | (value & 1);
			value >>= 1;
		}
		table[i] = reversed;
	}
	return table;
}

class SiriBandsProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this._sampleRate = sampleRate;
		this._ring = new Float32Array(FFT_SIZE);
		this._real = new Float32Array(FFT_SIZE);
		this._imag = new Float32Array(FFT_SIZE);
		this._mags = new Float32Array(FFT_HALF);
		this._window = makeHanningWindow();
		this._bitReverse = makeBitReverseTable();
		this._ringWrite = 0;
		this._pendingSamples = 0;
		this._peakLow = 1e-3;
		this._peakMid = 1e-3;
		this._peakHigh = 1e-3;
	}

	process(inputs, outputs) {
		const input = inputs[0]?.[0];
		const output = outputs[0]?.[0];
		if (output) output.fill(0);
		if (!input) return true;

		for (let i = 0; i < input.length; i += 1) {
			this._ring[this._ringWrite] = input[i];
			this._ringWrite = (this._ringWrite + 1) & (FFT_SIZE - 1);
		}

		this._pendingSamples += input.length;
		if (this._pendingSamples >= SPECTRUM_HOP_SIZE) {
			this._pendingSamples = 0;
			this._computeSpectrum();
			this.port.postMessage({
				low: this._agc(this._bandRms(20, LOW_MID_SPLIT_HZ), 'Low'),
				mid: this._agc(this._bandRms(LOW_MID_SPLIT_HZ, MID_HIGH_SPLIT_HZ), 'Mid'),
				high: this._agc(this._bandRms(MID_HIGH_SPLIT_HZ, this._sampleRate * 0.5), 'High')
			});
		}

		return true;
	}

	_computeSpectrum() {
		const first = FFT_SIZE - this._ringWrite;
		for (let i = 0; i < first; i += 1) {
			this._real[i] = this._ring[this._ringWrite + i] * this._window[i];
			this._imag[i] = 0;
		}
		for (let i = 0; i < this._ringWrite; i += 1) {
			const target = first + i;
			this._real[target] = this._ring[i] * this._window[target];
			this._imag[target] = 0;
		}

		this._fft(this._real, this._imag);

		const scale = 1 / FFT_SIZE;
		for (let i = 0; i < FFT_HALF; i += 1) {
			this._mags[i] = Math.hypot(this._real[i], this._imag[i]) * scale;
		}
	}

	_fft(real, imag) {
		for (let i = 0; i < FFT_SIZE; i += 1) {
			const j = this._bitReverse[i];
			if (j <= i) continue;
			const tr = real[i];
			const ti = imag[i];
			real[i] = real[j];
			imag[i] = imag[j];
			real[j] = tr;
			imag[j] = ti;
		}

		for (let size = 2; size <= FFT_SIZE; size <<= 1) {
			const half = size >> 1;
			const theta = (-2 * Math.PI) / size;
			const stepR = Math.cos(theta);
			const stepI = Math.sin(theta);

			for (let start = 0; start < FFT_SIZE; start += size) {
				let wr = 1;
				let wi = 0;
				for (let offset = 0; offset < half; offset += 1) {
					const even = start + offset;
					const odd = even + half;
					const tr = wr * real[odd] - wi * imag[odd];
					const ti = wr * imag[odd] + wi * real[odd];
					real[odd] = real[even] - tr;
					imag[odd] = imag[even] - ti;
					real[even] += tr;
					imag[even] += ti;

					const nextWr = wr * stepR - wi * stepI;
					wi = wr * stepI + wi * stepR;
					wr = nextWr;
				}
			}
		}
	}

	_bandRms(lowHz, highHz) {
		const binHz = this._sampleRate / FFT_SIZE;
		const start = Math.max(1, Math.floor(lowHz / binHz));
		const end = Math.min(this._mags.length - 1, Math.ceil(highHz / binHz));
		if (end <= start) return 0;

		let sum = 0;
		for (let i = start; i <= end; i += 1) {
			sum += this._mags[i] * this._mags[i];
		}
		return Math.sqrt(sum / (end - start + 1));
	}

	_agc(raw, band) {
		const key = `_peak${band}`;
		this[key] = Math.max(raw, Math.max(PEAK_FLOOR, this[key] * PEAK_DECAY));
		return clamp01(Math.pow(raw / this[key], 0.7));
	}
}

registerProcessor('siri-bands-processor', SiriBandsProcessor);
