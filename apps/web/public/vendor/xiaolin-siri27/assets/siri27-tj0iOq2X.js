import"./modulepreload-polyfill-B5Qt9EMX.js";/* empty css             */const st=Math.PI*2,F=1,lt=1e-4;function tt({response:e,dampingRatio:t}){const n=Math.max(e,lt),a=Math.max(0,t),i=st/n,o=F*i*i,s=2*a*F*i;return{mass:F,stiffness:o,damping:s,naturalAngularFrequency:i}}function ut({duration:e,bounce:t}){return tt({response:e,dampingRatio:Math.max(.05,1-Math.max(0,t))})}function ct(e,t,n,a,i){const o=a.stiffness/a.mass,s=a.naturalAngularFrequency,r=a.damping/(2*a.mass),l=Math.max(i,0),c=e-n;if(l<=0||c===0&&t===0)return[e,t];let m,p;if(r<s){const f=Math.sqrt(o-r*r),u=Math.exp(-r*l),h=Math.cos(f*l),d=Math.sin(f*l),_=c,S=(t+r*c)/f,E=_*h+S*d;m=u*E,p=u*(-r*E+(-_*f*d+S*f*h))}else if(s<r){const f=Math.sqrt(r*r-o),u=-r+f,h=-r-f,d=(t-h*c)/(u-h),_=c-d,S=Math.exp(u*l),E=Math.exp(h*l);m=d*S+_*E,p=d*u*S+_*h*E}else{const f=Math.exp(-r*l),u=t+r*c,h=c+u*l;m=f*h,p=f*(u-r*h)}return[n+m,p]}class R{constructor(t,n){this.value=t,this.velocity=0,this.target=t,this.parameters=H(n)}setOptions(t){this.parameters=H(t)}setTarget(t,n){n&&this.setOptions(n),this.target=t}jump(t){this.value=t,this.velocity=0,this.target=t}step(t){return[this.value,this.velocity]=ct(this.value,this.velocity,this.target,this.parameters,t),this.value}}function H(e){if("stiffness"in e&&"damping"in e){const t=e.mass||F,n=Math.sqrt(e.stiffness/t);return{mass:t,stiffness:e.stiffness,damping:e.damping,naturalAngularFrequency:n}}return"duration"in e&&"bounce"in e?ut(e):tt(e)}const v=1024,G=v/2,ft=512,ht=512,dt=1/60,U={response:.2,dampingRatio:1},W=500,q=3e3,mt=8e-4,vt=.9975,pt=new URL("./audio-worklet-COZsy2ao.js",import.meta.url);function A(e){return Math.max(0,Math.min(1,e))}function gt(){const e=new Float32Array(v);for(let t=0;t<v;t+=1)e[t]=.5-.5*Math.cos(2*Math.PI*t/(v-1));return e}function _t(){const e=new Uint16Array(v),t=Math.log2(v);for(let n=0;n<v;n+=1){let a=n,i=0;for(let o=0;o<t;o+=1)i=i<<1|a&1,a>>=1;e[n]=i}return e}class xt{constructor(){this.low=0,this.mid=0,this.high=0,this._rawLow=0,this._rawMid=0,this._rawHigh=0,this._lowSpring=new R(0,U),this._midSpring=new R(0,U),this._highSpring=new R(0,U),this._peakLow=.001,this._peakMid=.001,this._peakHigh=.001,this._context=null,this._source=null,this._workletNode=null,this._processor=null,this._silentGain=null,this._stream=null,this._preparePromise=null,this._workletModuleReady=!1,this._destinationConnected=!1,this._sampleRate=48e3,this._ring=new Float32Array(v),this._real=new Float32Array(v),this._imag=new Float32Array(v),this._mags=new Float32Array(G),this._window=gt(),this._bitReverse=_t(),this._ringWrite=0,this._pendingSamples=0,this._spectrumCooldown=0,this._demoAudio=new URLSearchParams(window.location.search).has("demoAudio"),this._demoTime=0,this.running=!1}async prepare(){if(this._demoAudio||this._preparePromise||this._workletModuleReady)return this._preparePromise;if(!this._supportsWorklet())return null;this._preparePromise=(async()=>{try{this._ensureAudioContext(),await this._ensureWorkletModule()}catch{this._workletModuleReady=!1}})();try{await this._preparePromise}finally{this._preparePromise=null}return null}async start(){if(this.running)return;if(this._demoAudio){this.running=!0;return}if(!navigator.mediaDevices?.getUserMedia)throw new Error("Microphone is not available in this browser.");this._stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}}),this._preparePromise&&await this._preparePromise;const t=window.AudioContext||window.webkitAudioContext;this._ensureAudioContext(t),this._source=this._context.createMediaStreamSource(this._stream),await this._connectAnalysisNode(),this._connectDestination(),this._context.state==="suspended"&&await this._context.resume(),this.running=!0}stop({closeContext:t=!1}={}){if(this._workletNode&&(this._workletNode.port.onmessage=null),this._processor&&(this._processor.onaudioprocess=null),this._source&&this._source.disconnect(),this._workletNode&&this._workletNode.disconnect(),this._processor&&this._processor.disconnect(),this._silentGain&&(this._silentGain.disconnect(),this._destinationConnected=!1),this._stream)for(const n of this._stream.getTracks())n.stop();t&&(this._context?.state!=="closed"&&this._context?.close(),this._context=null,this._silentGain=null,this._workletModuleReady=!1,this._destinationConnected=!1),this._source=null,this._workletNode=null,this._processor=null,this._stream=null,this.running=!1,this.low=0,this.mid=0,this.high=0,this._rawLow=0,this._rawMid=0,this._rawHigh=0,this._lowSpring.jump(0),this._midSpring.jump(0),this._highSpring.jump(0),this._peakLow=.001,this._peakMid=.001,this._peakHigh=.001,this._ring.fill(0),this._ringWrite=0,this._pendingSamples=0,this._spectrumCooldown=0,this._demoTime=0}update(t){return this.running&&this._demoAudio?(this._demoTime+=t,this._rawLow=A(.44+.34*Math.sin(this._demoTime*3.1)),this._rawMid=A(.34+.3*Math.sin(this._demoTime*4.7+1.7)),this._rawHigh=A(.26+.32*Math.sin(this._demoTime*8.4+.9))):this.running&&!this._workletNode&&this._maybeComputeSpectrum(t),this._lowSpring.setTarget(this._rawLow),this._midSpring.setTarget(this._rawMid),this._highSpring.setTarget(this._rawHigh),this.low=this._lowSpring.step(t),this.mid=this._midSpring.step(t),this.high=this._highSpring.step(t),{low:this.low,mid:this.mid,high:this.high}}_supportsWorklet(){return!!((window.AudioContext||window.webkitAudioContext)&&window.AudioWorkletNode)}_ensureAudioContext(t=window.AudioContext||window.webkitAudioContext){this._context&&this._context.state!=="closed"||(this._context=new t({latencyHint:"interactive"}),this._sampleRate=this._context.sampleRate,this._silentGain=this._context.createGain(),this._silentGain.gain.value=0,this._workletModuleReady=!1,this._destinationConnected=!1)}async _ensureWorkletModule(){return this._workletModuleReady?!0:!this._context.audioWorklet||typeof AudioWorkletNode>"u"?!1:(await this._context.audioWorklet.addModule(pt),this._workletModuleReady=!0,!0)}_connectDestination(){this._destinationConnected||(this._silentGain.connect(this._context.destination),this._destinationConnected=!0)}async _connectAnalysisNode(){if(this._supportsWorklet())try{await this._ensureWorkletModule(),this._workletNode=new AudioWorkletNode(this._context,"siri-bands-processor"),this._workletNode.port.onmessage=t=>{const{low:n,mid:a,high:i}=t.data||{};Number.isFinite(n)&&(this._rawLow=A(n)),Number.isFinite(a)&&(this._rawMid=A(a)),Number.isFinite(i)&&(this._rawHigh=A(i))},this._source.connect(this._workletNode),this._workletNode.connect(this._silentGain);return}catch{this._workletNode=null}this._processor=this._context.createScriptProcessor(ft,1,1),this._processor.onaudioprocess=t=>this._process(t),this._source.connect(this._processor),this._processor.connect(this._silentGain)}_process(t){const n=t.inputBuffer.getChannelData(0);t.outputBuffer.getChannelData(0).fill(0);for(let i=0;i<n.length;i+=1)this._ring[this._ringWrite]=n[i],this._ringWrite=this._ringWrite+1&v-1;this._pendingSamples+=n.length}_maybeComputeSpectrum(t){this._spectrumCooldown=Math.max(0,this._spectrumCooldown-t),!(this._pendingSamples<ht||this._spectrumCooldown>0)&&(this._pendingSamples=0,this._spectrumCooldown=dt,this._computeSpectrum())}_computeSpectrum(){const t=v-this._ringWrite;for(let a=0;a<t;a+=1)this._real[a]=this._ring[this._ringWrite+a]*this._window[a],this._imag[a]=0;for(let a=0;a<this._ringWrite;a+=1){const i=t+a;this._real[i]=this._ring[a]*this._window[i],this._imag[i]=0}this._fft(this._real,this._imag);const n=1/v;for(let a=0;a<G;a+=1)this._mags[a]=Math.hypot(this._real[a],this._imag[a])*n;this._rawLow=this._agc(this._bandRms(20,W),"Low"),this._rawMid=this._agc(this._bandRms(W,q),"Mid"),this._rawHigh=this._agc(this._bandRms(q,this._sampleRate*.5),"High")}_fft(t,n){for(let a=0;a<v;a+=1){const i=this._bitReverse[a];if(i<=a)continue;const o=t[a],s=n[a];t[a]=t[i],n[a]=n[i],t[i]=o,n[i]=s}for(let a=2;a<=v;a<<=1){const i=a>>1,o=-2*Math.PI/a,s=Math.cos(o),r=Math.sin(o);for(let l=0;l<v;l+=a){let c=1,m=0;for(let p=0;p<i;p+=1){const f=l+p,u=f+i,h=c*t[u]-m*n[u],d=c*n[u]+m*t[u];t[u]=t[f]-h,n[u]=n[f]-d,t[f]+=h,n[f]+=d;const _=c*s-m*r;m=c*r+m*s,c=_}}}}_bandRms(t,n){const a=this._sampleRate/v,i=Math.max(1,Math.floor(t/a)),o=Math.min(this._mags.length-1,Math.ceil(n/a));if(o<=i)return 0;let s=0;for(let r=i;r<=o;r+=1)s+=this._mags[r]*this._mags[r];return Math.sqrt(s/(o-i+1))}_agc(t,n){const a=`_peak${n}`;return this[a]=Math.max(t,Math.max(mt,this[a]*vt)),A(Math.pow(t/this[a],.7))}}const wt=`#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uMouse;

uniform float uResolved;
uniform float uLayerOpacity;
uniform float uUnresolvedScale;
uniform float uEffectScale;
uniform vec2 uAnchor;

uniform float uAmplitude;
uniform float uFreq;
uniform float uAberrationFreq;
uniform float uWavePhase;
uniform float uWaveSpeed;
uniform float uWaveScale;
uniform float uAberration;
uniform float uThickness;
uniform float uIntensity;
uniform float uFalloff;
uniform float uEdgeMask;
uniform float uEdgeMaskInset;
uniform float uBandFill;
uniform float uBandFillThickness;
uniform float uSoftness;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uLowAmplitude;
uniform float uLowIntensity;
uniform float uMidAberration;
uniform float uMidAberrationAmplitude;
uniform float uMidBandFill;
uniform float uMidSoftness;
uniform float uHighAberration;
uniform float uHighAberrationAmplitude;

out vec4 outColor;

float saturate(float value) {
	return clamp(value, 0.0, 1.0);
}

vec3 spectrumTri(float t) {
	return clamp(vec3(abs(t - 3.0) - 1.0, 2.0 - abs(t - 2.0), 2.0 - abs(t - 4.0)), 0.0, 1.0);
}

float smoothUnit(float value) {
	return value * value * (3.0 - 2.0 * value);
}

void main() {
	vec2 gid = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	float tw = mod(uWavePhase, 62.831848) * uWaveSpeed;
	float lo = saturate(uLow);
	float md = saturate(uMid);
	float hi = saturate(uHigh);
	float res = saturate(uResolved);

	float c52 = uThickness * 0.01;
	float c55 = (lo * uLowIntensity + uIntensity) * 0.01;
	float c58 = max(0.0, md * uMidSoftness + uSoftness);
	float c61 = (md * uMidBandFill + uBandFill) * 0.0001;
	float c64 = (uLowAmplitude * 0.01) * lo + uAmplitude;
	float c68 = c64 + md * uMidAberrationAmplitude + hi * uHighAberrationAmplitude;
	float c72 = (md * uMidAberration + uAberration) + hi * uHighAberration;
	float c73 = c72 * res;
	float c76 = lo * 14.0;
	float c75 = md * 10.0 + 4.0;
	float n77 = mix(0.1, c52, res);
	float n78 = mix(0.1, c55, res);
	float n80 = (res * 0.01) * c58;
	float n81 = mix(c75, 1.0, res);
	float omr = 1.0 - res;

	vec2 uv = (gid + 0.5) * 2.0 / uResolution - 1.0;
	float aspect = uResolution.x / uResolution.y;
	uv.x *= aspect;
	vec2 q = uv - vec2(aspect, 1.0) * (uAnchor * 2.0 - 1.0);
	float ws = max(uWaveScale * uEffectScale, 0.01);
	vec2 p = q / ws;
	float base = mix(0.14, uUnresolvedScale, res);
	float r = length(p);
	float edge = max(r - base, 0.0);
	float aC = max(aspect, 1.0);
	float px = p.x / aC;
	float cw = min(abs(px * 0.9), 1.0);
	float cw2 = pow(cos(cw * 1.5707964), 2.0);
	float eps = 0.0001;
	float atArg = atan(px * eps) * aC / eps;
	float waveBase = (cw2 * res * c68) * sin(atArg * uFreq + tw);
	float negBase = -c73;
	float atArg2 = atArg * uAberrationFreq + tw;
	float py = p.y;
	float n80sq = n80 * n80;
	float bft = max(uBandFillThickness, 0.0001);
	float n139 = (c61 * res) * n78;
	float env68 = cw2 * c68;
	vec2 mouseUv = uMouse.xy / max(uResolution, vec2(1.0));
	float mouseLift = uMouse.z * 0.035 * exp(-pow((mouseUv.x * 2.0 - 1.0) * 2.4, 2.0));

	vec3 colAcc = vec3(0.0);
	vec3 wSum = vec3(0.0);
	for (int i = 0; i < 4; i += 1) {
		float fi = float(i);
		float t13 = fi * 0.33333334;
		vec3 hue = mix(vec3(1.0), spectrumTri(fi), vec3(res));
		wSum += hue;
		float ph = atArg2 + mix(negBase, c73, t13);
		float w2 = env68 * sin(ph) + mouseLift;
		float dist = mix(edge, abs(py - w2), res);
		float rad = sqrt(dist * dist + n80sq) + n77;
		float k = dist * 0.02;
		float soft = mix(1.0 / (k * k + 1.0), 1.0, res);
		float glowL = (soft * n78) / rad;
		float band = max(0.0, max(py - max(waveBase, w2), min(waveBase, w2) - py));
		float fill = n139 / (band + bft);
		colAcc += (hue * n81) * (fill + glowL);
	}
	vec3 col = colAcc / max(wSum, vec3(0.0001));

	float tail = omr * (c76 + 4.0);
	float dC = mix(edge, abs(py - waveBase), res);
	float radC = dC + n77;
	float kC = dC * 0.02;
	float softC = mix(1.0 / (kC * kC + 1.0), 1.0, res);
	float cg = (n78 * 0.5 * (softC + tail)) / radC;
	vec3 cgl = pow(vec3(cg) + col, vec3(1.5));

	float ndcY = gid.y * 2.0 / uResolution.y - 1.0;
	float emC = max(clamp(uEdgeMask, 0.0, 1.0), 0.0001);
	float emMask = clamp((abs(ndcY) - 1.0 + clamp(uEdgeMaskInset, 0.0, 1.0)) / (-emC), 0.0, 1.0);
	emMask = smoothUnit(emMask);
	float fall = exp(-pow(px * uFalloff, 2.0));
	col = cgl * mix(1.0, emMask * fall, res) * res * saturate(uLayerOpacity);

	// hue-preserving clip guard: only when a channel would exceed 1 do we scale the whole color
	// down (max→1) so the core keeps its hue instead of washing to white. Values ≤1 untouched.
	float m = max(max(col.r, col.g), col.b);
	col *= (m > 1.0) ? (1.0 / m) : 1.0;

	float alpha = saturate(max(max(col.r, col.g), col.b) * 1.15);
	outColor = vec4(col, alpha);
}
`,St=`#version 300 es
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
		vec2 dir = vec2(ca, sa);
		vec2 base = (ringAmp * dir) * (1.0 - 2.0 * progressAt(i));
		float ph2 = pairAmp * amp;
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
	// hue-preserving clip guard: scale down only when over 1 (max→1), keeping the dot's hue.
	float m = max(max(col.r, col.g), col.b);
	col *= (m > 1.0) ? (1.0 / m) : 1.0;
	float alpha = saturate(max(max(col.r, col.g), col.b));
	outColor = vec4(col, alpha);
}
`,At=`#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uBackground;
uniform vec2 uTextureSize;
uniform vec2 uCanvasSize;
uniform float uBackgroundReady;

out vec4 outColor;

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
	vec3 tint = mix(bottom, top, 1.0 - uv.y);
	return tint + vec3(0.02, 0.035, 0.055) * vignette;
}

void main() {
	vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	vec2 uv = pixel / uCanvasSize;
	vec3 image = texture(uBackground, coverUv(uv)).rgb;
	vec3 background = mix(fallbackBackground(uv), image, clamp(uBackgroundReady, 0.0, 1.0));
	outColor = vec4(background, 1.0);
}
`,Rt=`#version 300 es
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

	// effect OVER container, both premultiplied (container.rgb = 0)
	float invEffectA = 1.0 - effect.a;
	vec3 outRGB = effect.rgb;
	float outA = effect.a + containerA * invEffectA;
	outColor = vec4(outRGB, outA);
}
`,Tt=`#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uSceneTexture;
uniform sampler2D uBackground;

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

	// Keep the original dark Siri glass look inside the orb only.
	vec3 col = sampleScene(rUv);
	col += vec3(highlightBand(d, grad) * uHlAmount);
	return vec4(col, alpha);
}

void main() {
	vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
	vec4 glass = glassFragment(pixel);
	vec3 finalColor = clamp(glass.rgb, 0.0, 1.25);
	outColor = vec4(finalColor, saturate(glass.a));
}
`;function bt(e,t){return[{name:"uResolved",value:e.sharedResolved},{name:"uLayerOpacity",value:e.waveLayerOpacity},{name:"uUnresolvedScale",value:.05},{name:"uEffectScale",value:e.effectScale},{name:"uAnchor",type:"vec2",value:[.5,.5]},{name:"uAmplitude",value:.125},{name:"uFreq",value:1},{name:"uAberrationFreq",value:1},{name:"uWavePhase",value:e.wavePhase},{name:"uWaveSpeed",value:-1},{name:"uWaveScale",value:1},{name:"uAberration",value:.5},{name:"uThickness",value:8},{name:"uIntensity",value:8},{name:"uFalloff",value:2.025},{name:"uEdgeMask",value:0},{name:"uEdgeMaskInset",value:0},{name:"uBandFill",value:0},{name:"uBandFillThickness",value:0},{name:"uSoftness",value:3},{name:"uLow",value:t.low*.4},{name:"uMid",value:t.mid*.4},{name:"uHigh",value:t.high*.4},{name:"uLowAmplitude",value:75},{name:"uLowIntensity",value:0},{name:"uMidAberration",value:5},{name:"uMidAberrationAmplitude",value:0},{name:"uMidBandFill",value:70},{name:"uMidSoftness",value:0},{name:"uHighAberration",value:5},{name:"uHighAberrationAmplitude",value:0}]}function Et(e,t){return[{name:"uDotsResolved",value:e.dotsResolved},{name:"uEffectScale",value:e.effectScale},{name:"uAnchor",type:"vec2",value:[.5,.5]},{name:"uRotation",value:.7},{name:"uRingRadius",value:.45},{name:"uDotRadius",value:.1},{name:"uPairOffset",value:.085},{name:"uPairSmoothness",value:.2},{name:"uSmoothness",value:.2},{name:"uProgress0",value:t[0].value},{name:"uProgress1",value:t[1].value},{name:"uProgress2",value:t[2].value},{name:"uProgress3",value:t[3].value},{name:"uProgress4",value:t[4].value},{name:"uProgress5",value:t[5].value},{name:"uScaleDuration",value:2},{name:"uScaleStagger",value:.167},{name:"uScaleMin",value:.001},{name:"uScaleMax",value:.65},{name:"uGlowIntensity",value:.04},{name:"uFalloffPower",value:.7},{name:"uGlowFadeStart",value:0},{name:"uGlowFadeEnd",value:.7},{name:"uDotsAberration",value:-.05},{name:"uCenterCore",value:.5},{name:"uDotsScale",value:1},{name:"uAppear",value:e.dotsAppear}]}const yt=`#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
	vec2(-1.0, -1.0),
	vec2(3.0, -1.0),
	vec2(-1.0, 3.0)
);

void main() {
	gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`,Ct=2,Mt=20,kt=1.18,Pt=new Uint8Array([3,4,8,255]);function Ft(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Dt(e,t){for(let n=0;n<e.length;n+=1)if(e[n]!==t[n])return!1;return!0}function et(e){return typeof e=="number"||typeof e=="boolean"?[Number(e)]:Array.isArray(e)?e.flat(Number.POSITIVE_INFINITY).map(Number):Ft(e)?Array.from(e,Number):[]}function It(e,t){if(e)return e;if(typeof t=="boolean")return"bool";if(typeof t=="number")return"float";const n=et(t);return n.length===2?"vec2":n.length===3?"vec3":n.length===4?"vec4":n.length===9?"mat3":n.length===16?"mat4":"float"}function V(e,t,n,a){const i=e.createShader(t);if(e.shaderSource(i,n),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS)){const o=e.getShaderInfoLog(i)||`Unknown ${a} shader compile error.`;throw e.deleteShader(i),new Error(o)}return i}function y(e,t,n){const a=V(e,e.VERTEX_SHADER,yt,`${n} vertex`),i=V(e,e.FRAGMENT_SHADER,t,`${n} fragment`),o=e.createProgram();if(e.attachShader(o,a),e.attachShader(o,i),e.linkProgram(o),e.deleteShader(a),e.deleteShader(i),!e.getProgramParameter(o,e.LINK_STATUS)){const s=e.getProgramInfoLog(o)||`Unknown ${n} program link error.`;throw e.deleteProgram(o),new Error(s)}return{label:n,program:o,uniforms:new Map,types:new Map,values:new Map}}function nt(e){const t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),t}function X(e,t,n,a,i,o){const s=nt(e);e.texImage2D(e.TEXTURE_2D,0,a,t,n,0,i,o,null);const r=e.createFramebuffer();if(e.bindFramebuffer(e.FRAMEBUFFER,r),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,s,0),e.checkFramebufferStatus(e.FRAMEBUFFER)!==e.FRAMEBUFFER_COMPLETE)throw e.deleteFramebuffer(r),e.deleteTexture(s),new Error("Siri 27 framebuffer is incomplete.");return e.bindFramebuffer(e.FRAMEBUFFER,null),{framebuffer:r,texture:s,width:t,height:n}}function P(e,t){t&&(e.deleteFramebuffer(t.framebuffer),e.deleteTexture(t.texture))}class Ut{constructor(t){if(this.canvas=t,this.gl=t.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,preserveDrawingBuffer:!1}),this.dpr=1,this.width=1,this.height=1,this.time=0,this.backgroundSize=[1,1],this.backgroundReady=0,this.backgroundTexture=null,this.effectTarget=null,this.sceneTarget=null,this.disposed=!1,this.error=null,this._lastImage=null,this._contextLost=!1,this.container={black:.25,fade:1,gauss:8,strength:.9},this._onContextLost=n=>{n.preventDefault(),this._contextLost=!0,this.effectTarget=null,this.sceneTarget=null},this._onContextRestored=()=>{try{this._contextLost=!1,this.error=null,this._initGL()}catch(n){this.error=n,this._dispatchError(n)}},!this.gl){this.error=new Error("WebGL2 is not available in this browser."),this._dispatchError(this.error);return}this.canvas.addEventListener("webglcontextlost",this._onContextLost),this.canvas.addEventListener("webglcontextrestored",this._onContextRestored);try{this._initGL()}catch(n){this.error=n,this._dispatchError(n)}}_initGL(){const t=this.gl;this.vertexArray=t.createVertexArray(),this.programs={wave:y(t,wt,"wave"),dots:y(t,St,"dots"),background:y(t,At,"background"),effectComposite:y(t,Rt,"effect composite"),glassComposite:y(t,Tt,"glass composite")},this.backgroundTexture=nt(t),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,Pt),t.bindVertexArray(this.vertexArray),t.disable(t.DEPTH_TEST),t.disable(t.STENCIL_TEST),this.backgroundReady=0,this.backgroundSize=[1,1],this.effectTarget=null,this.sceneTarget=null,this._lastImage&&this.setBackgroundImage(this._lastImage)}setBackgroundImage(t){const n=this.gl;this._lastImage=t,!(!n||this.disposed||this.error||this._contextLost)&&(n.bindTexture(n.TEXTURE_2D,this.backgroundTexture),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.texImage2D(n.TEXTURE_2D,0,n.RGBA,n.RGBA,n.UNSIGNED_BYTE,t),this.backgroundSize=[t.naturalWidth||t.width||1,t.naturalHeight||t.height||1],this.backgroundReady=1)}render({surface:t,progress:n,bands:a,sizes:i,dt:o=0}){if(!this.gl||this.disposed||this.error||this._contextLost||!t||!i)return;this.time=(this.time+Math.max(0,Math.min(o,.1)))%1e5,this._resize();const r=this._layout(t,i);this._ensureTargets(r),this._renderEffectPass(t,n,a,r),this._renderScenePass(r),this._renderGlassPass(r)}dispose(){const t=this.gl;if(this._onContextLost&&(this.canvas.removeEventListener("webglcontextlost",this._onContextLost),this.canvas.removeEventListener("webglcontextrestored",this._onContextRestored)),!(!t||this.disposed)){P(t,this.effectTarget),P(t,this.sceneTarget),this.backgroundTexture&&t.deleteTexture(this.backgroundTexture);for(const n of Object.values(this.programs||{}))t.deleteProgram(n.program);this.vertexArray&&t.deleteVertexArray(this.vertexArray),this.effectTarget=null,this.sceneTarget=null,this.backgroundTexture=null,this.disposed=!0}}_resize(){const t=this.canvas.getBoundingClientRect(),n=Math.max(1,t.width||window.innerWidth||1),a=Math.max(1,t.height||window.innerHeight||1),i=Math.min(Ct,Math.max(1,window.devicePixelRatio||1)),o=Math.max(1,Math.round(n*i)),s=Math.max(1,Math.round(a*i));o===this.width&&s===this.height&&i===this.dpr||(this.dpr=i,this.width=o,this.height=s,this.canvas.width=o,this.canvas.height=s)}_layout(t,n){const a=1+t.press*.018,i=Mt*this.dpr,o=n.expanded.width*this.dpr*a,s=o+i*2,r=o+i*2,l=Math.max(1,Math.round(n.expanded.width*kt*this.dpr)),c=(this.width-s)*.5,m=(this.height-r)*.5,p=m+r*.5;return{effectWidth:l,effectHeight:l,effectOrigin:[(this.width-l)*.5,p-l*.5],effectSize:[l,l],panelOrigin:[c,m],panelSize:[s,r],margin:i,cornerRadius:o*.5,containerStrength:this.container.strength*Math.min(1,Math.max(0,t.sharedResolved||0))}}_ensureTargets(t){const n=this.gl,a=n.RGBA8,i=n.UNSIGNED_BYTE;(!this.effectTarget||this.effectTarget.width!==t.effectWidth||this.effectTarget.height!==t.effectHeight)&&(P(n,this.effectTarget),this.effectTarget=X(n,t.effectWidth,t.effectHeight,a,n.RGBA,i)),(!this.sceneTarget||this.sceneTarget.width!==this.width||this.sceneTarget.height!==this.height)&&(P(n,this.sceneTarget),this.sceneTarget=X(n,this.width,this.height,a,n.RGBA,i))}_renderEffectPass(t,n,a,i){const o=this.gl;o.bindFramebuffer(o.FRAMEBUFFER,this.effectTarget.framebuffer),o.viewport(0,0,i.effectWidth,i.effectHeight),o.clearColor(0,0,0,0),o.clear(o.COLOR_BUFFER_BIT),o.enable(o.BLEND),o.blendEquation(o.FUNC_ADD),o.blendFunc(o.ONE,o.ONE_MINUS_SRC_ALPHA);const s=[{name:"uResolution",type:"vec2",value:[i.effectWidth,i.effectHeight]},{name:"uTime",value:this.time},{name:"uMouse",type:"vec4",value:[i.effectWidth*.5,i.effectHeight*.5,t.press,0]}];this._draw(this.programs.wave,[...s,...bt(t,a)]),this._draw(this.programs.dots,[...s,...Et(t,n)]),o.disable(o.BLEND)}_renderScenePass(t){const n=this.gl;n.bindFramebuffer(n.FRAMEBUFFER,this.sceneTarget.framebuffer),n.viewport(0,0,this.width,this.height),n.clearColor(0,0,0,1),n.clear(n.COLOR_BUFFER_BIT),this._draw(this.programs.background,[{name:"uResolution",type:"vec2",value:[this.width,this.height]},{name:"uTextureSize",type:"vec2",value:this.backgroundSize},{name:"uCanvasSize",type:"vec2",value:[this.width,this.height]},{name:"uBackgroundReady",value:this.backgroundReady}],[{name:"uBackground",texture:this.backgroundTexture,unit:0}]),n.enable(n.BLEND),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),this._draw(this.programs.effectComposite,[{name:"uResolution",type:"vec2",value:[this.width,this.height]},{name:"uCanvasSize",type:"vec2",value:[this.width,this.height]},{name:"uEffectOrigin",type:"vec2",value:t.effectOrigin},{name:"uEffectSize",type:"vec2",value:t.effectSize},{name:"uContainer",value:t.containerStrength},{name:"uContainerBlack",value:this.container.black},{name:"uContainerFade",value:this.container.fade},{name:"uContainerGauss",value:this.container.gauss}],[{name:"uEffectTexture",texture:this.effectTarget.texture,unit:0}]),n.disable(n.BLEND)}_renderGlassPass(t){const n=this.gl;n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,this.width,this.height),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),this._draw(this.programs.glassComposite,[{name:"uResolution",type:"vec2",value:[this.width,this.height]},{name:"uTextureSize",type:"vec2",value:this.backgroundSize},{name:"uPanelSize",type:"vec2",value:t.panelSize},{name:"uCanvasSize",type:"vec2",value:[this.width,this.height]},{name:"uPanelOrigin",type:"vec2",value:t.panelOrigin},{name:"uMarginPx",value:t.margin},{name:"uCornerRadius",value:t.cornerRadius},{name:"uHeight",value:18*this.dpr},{name:"uCurvature",value:1},{name:"uRefractAmount",value:-56*this.dpr},{name:"uAngle",value:0},{name:"uGradRadialMix",value:.08},{name:"uKeyAngle",value:Math.PI*.25},{name:"uFillAngle",value:Math.PI*1.25},{name:"uHlHeight",value:2.2*this.dpr},{name:"uHlCut",value:.52},{name:"uHlNorm",value:8},{name:"uHlAmount",value:.72},{name:"uHlCurv",value:1},{name:"uBackgroundReady",value:this.backgroundReady}],[{name:"uSceneTexture",texture:this.sceneTarget.texture,unit:0},{name:"uBackground",texture:this.backgroundTexture,unit:1}])}_draw(t,n=[],a=[]){const i=this.gl;i.useProgram(t.program),i.bindVertexArray(this.vertexArray);for(const o of a)this._setTexture(t,o.name,o.texture,o.unit);for(const o of n)this._setUniform(t,o.name,o.value,o.type);i.drawArrays(i.TRIANGLES,0,3)}_setTexture(t,n,a,i){const o=this.gl,s=this._getUniformLocation(t,n);s!==null&&(o.activeTexture(o.TEXTURE0+i),o.bindTexture(o.TEXTURE_2D,a),o.uniform1i(s,i))}_setUniform(t,n,a,i){if(!n)return;const o=this.gl,s=this._getUniformLocation(t,n);if(s===null)return;let r=t.types.get(n);r===void 0&&(r=It(i,a),t.types.set(n,r));const l=et(a),c=t.values.get(n);c!==void 0&&c.length===l.length&&Dt(c,l)||(t.values.set(n,l),r==="int"||r==="sampler2D"||r==="bool"?o.uniform1i(s,l[0]||0):r==="ivec2"?o.uniform2iv(s,l.slice(0,2)):r==="ivec3"?o.uniform3iv(s,l.slice(0,3)):r==="ivec4"?o.uniform4iv(s,l.slice(0,4)):r==="vec2"?o.uniform2fv(s,l.slice(0,2)):r==="vec3"?o.uniform3fv(s,l.slice(0,3)):r==="vec4"?o.uniform4fv(s,l.slice(0,4)):r==="mat3"?o.uniformMatrix3fv(s,!1,l.slice(0,9)):r==="mat4"?o.uniformMatrix4fv(s,!1,l.slice(0,16)):o.uniform1f(s,l[0]||0))}_getUniformLocation(t,n){if(t.uniforms.has(n))return t.uniforms.get(n);const a=this.gl.getUniformLocation(t.program,n);return t.uniforms.set(n,a),a}_dispatchError(t){const n=t instanceof Error?t.message:String(t);this.canvas.dispatchEvent(new CustomEvent("siri-render-error",{detail:{message:n}})),console.error(n)}}const Lt=128,K={response:.314,dampingRatio:1},Bt={response:.3,dampingRatio:1},j={response:.28,dampingRatio:1},Y={response:.314,dampingRatio:1},L={duration:.9,bounce:.55},Ot=.2,Nt=5,zt=1/30,Z=62.831848,Ht=-2.5,Gt=-12,Wt=.4,$={idle:{waveActive:!0,fluidDotsActive:!1},listening:{waveActive:!0,fluidDotsActive:!1},thinking:{waveActive:!1,fluidDotsActive:!0}};function Q(){return{fluidDots:0,effectScale:0}}function J(e){return{fluidDots:e.fluidDotsActive?1:-1,effectScale:e.fluidDotsActive?2/3:1}}function qt(e,t){let n=Math.min(Math.max(t,0),.1);for(;n>0;){const a=Math.min(n,zt);for(const i of["fluidDots","effectScale"]){const s=(e.current[i]-e.target[i])*-400+e.velocity[i]*-40;e.velocity[i]+=s*a,e.current[i]+=e.velocity[i]*a}n-=a}}function Vt(e,t){e.dotsResolved=t.fluidDots,e.effectScale=t.effectScale,e.waveResolved=e.waveOpacity*2-1,e.sharedResolved=Math.max(e.waveResolved,e.dotsResolved,0),e.waveLayerOpacity=.98*Math.min(1,Math.max(0,e.waveOpacity))}function Xt(e){return e?Math.max(0,Math.min(1,Math.max(e.low||0,e.mid||0,e.high||0)*Wt)):0}function Kt(e,t,n){const a=Ht+Gt*Xt(n);e.wavePhase=(e.wavePhase+a*t)%Z,e.wavePhase<0&&(e.wavePhase+=Z)}function jt(){const e=J($.idle),t={waveOpacity:0,wavePhase:0,waveResolved:-1,sharedResolved:0,dotsAppear:0,dotsResolved:e.fluidDots,effectScale:e.effectScale,waveLayerOpacity:0,press:0},n={waveOpacity:new R(t.waveOpacity,K),dotsAppear:new R(t.dotsAppear,Y),press:new R(t.press,j)},a={current:{...e},velocity:Q(),target:{...e}},i=Array.from({length:6},()=>({value:0})),o=i.map(()=>new R(0,L));let s="idle",r=0,l=0,c=0,m=Number.POSITIVE_INFINITY;function p(){l=r,r=r>.5?0:1,m=0}function f(){l=0,r=0,c=0,m=Number.POSITIVE_INFINITY;for(const u of o)u.setTarget(0,L)}return{sizes:{expanded:{width:Lt}},surface:t,progress:i,get state(){return s},select(u){const h=$[u];if(!h)return;const d=J(h),_=a.target.fluidDots!==d.fluidDots||a.target.effectScale!==d.effectScale;s=u,c=0,n.waveOpacity.setTarget(h.waveActive?1:0,h.waveActive?K:Bt),a.target=d,_&&(a.velocity=Q()),u!=="thinking"&&f()},setPressed(u){n.press.setTarget(u?1:0,j)},tick(u,h){t.waveOpacity=n.waveOpacity.step(u),t.press=n.press.step(u),qt(a,u),Vt(t,a.current),Kt(t,u,h),n.dotsAppear.setTarget(Math.max(t.dotsResolved,0),Y),t.dotsAppear=n.dotsAppear.step(u),s==="thinking"&&t.dotsResolved>0?(c+=u,c>=Nt&&(c=0,p())):f(),m+=u;for(let d=0;d<o.length;d+=1){const S=d*Ot>m?l:r;o[d].setTarget(S,L),i[d].value=o[d].step(u)}}}}const Yt="data:image/gif;base64,R0lGODlhAQABAAAAACw=",b=document.querySelector("#siri27-canvas"),x=document.querySelector("#siri-hint"),w=document.querySelector("#mic-status"),Zt=360;b.addEventListener("siri-render-error",e=>{w.textContent=e.detail?.message||"WebGL renderer failed."});const k=new Ut(b),T=new xt,g=jt();let O=0,B=0,M=0,C=0;k.error&&(w.textContent=k.error.message);function $t(){const e=new Image;let t=!1;function n(){t||(t=!0,k.setBackgroundImage(e))}e.crossOrigin="anonymous",e.decoding="async",e.addEventListener("load",n,{once:!0}),e.addEventListener("error",()=>{w.textContent="Background image failed to load; using fallback."},{once:!0}),e.src=Yt,typeof e.decode=="function"&&e.decode().then(n).catch(()=>{})}function Qt(){const e=()=>{T.prepare()};"requestIdleCallback"in window?window.requestIdleCallback(e,{timeout:1200}):window.setTimeout(e,160)}function N(){M&&window.clearTimeout(M),M=0,C+=1}function Jt(){N();const e=C;w.textContent="Microphone will start after the transition.",M=window.setTimeout(async()=>{if(M=0,!(g.state!=="listening"||e!==C)){w.textContent="Microphone permission requested.";try{if(await T.start(),g.state!=="listening"||e!==C){T.stop();return}w.textContent="Microphone active."}catch(t){e===C&&(w.textContent=t instanceof Error?t.message:String(t))}}},Zt)}function D(e){g.select(e),e==="listening"?Jt():(N(),T.stop(),w.textContent=e==="idle"?"Idle.":"Microphone inactive.")}function at(e,t=0){k.render({surface:g.surface,progress:g.progress,bands:e,sizes:g.sizes,dt:t})}function it(e){const t=B?Math.min((e-B)/1e3,.1):0;B=e;const n=T.update(t);g.tick(t,n),at(n,t),O=requestAnimationFrame(it)}const ot="Hold to speak",te="Release to send",ee=5e3;let I=0;function ne(e){b.setPointerCapture(e.pointerId),window.clearTimeout(I),g.setPressed(!0),D("listening"),x&&(x.textContent=te)}function z(){g.state==="listening"&&(g.setPressed(!1),D("thinking"),x&&(x.textContent="Thinking…"),window.clearTimeout(I),I=window.setTimeout(()=>{D("idle"),x&&(x.textContent=ot)},ee))}b.addEventListener("pointerdown",ne);b.addEventListener("pointerup",z);b.addEventListener("pointercancel",z);b.addEventListener("lostpointercapture",z);D("idle");x&&(x.textContent=ot);const rt=T.update(0);g.tick(0,rt);at(rt);$t();Qt();O=requestAnimationFrame(it);window.addEventListener("pagehide",()=>{N(),window.clearTimeout(I),T.stop({closeContext:!0}),cancelAnimationFrame(O),k.dispose()},{once:!0});
