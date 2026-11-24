// Manhana glucose model: two-compartment gut absorption + Bergman minimal model
// with simple glucose-driven insulin secretion. Educational approximation only.
(function (root) {
  const PROFILES = {
    healthy: { label: 'سليم', Gb: 90, SG: 0.022, p2: 0.035, SI: 8e-4, Ib: 8, n: 0.12, beta: 0.13 },
    prediabetes: { label: 'ما قبل السكري', Gb: 108, SG: 0.016, p2: 0.025, SI: 3e-4, Ib: 12, n: 0.1, beta: 0.06 },
    t2d: { label: 'سكري نوع ٢', Gb: 140, SG: 0.012, p2: 0.02, SI: 1.5e-4, Ib: 14, n: 0.09, beta: 0.035 },
  };

  const BODY_DL = 1.6 * 70; // glucose distribution volume (dL) for a 70 kg adult
  const AG = 0.9;            // carbohydrate bioavailability
  const TMAX = 40;           // gut absorption time constant (min)

  // meals: [{t: minutes, carbs: g, gi: 0-100}], walks: [{t, dur}]
  function simulate(profile, meals, opts = {}) {
    const p = Object.assign({}, profile, opts.override || {});
    const T = opts.duration || 240, dt = 0.5;
    let G = p.Gb, X = 0, I = p.Ib, Q1 = 0, Q2 = 0;
    const out = [];
    const pending = meals.map(m => ({ ...m, done: false }));
    const walks = opts.walks || [];
    for (let k = 0; k <= T / dt; k++) {
      const t = k * dt;
      for (const m of pending) {
        if (!m.done && t >= m.t) {
          // glycemic-load scaling: effective glucose = carbs * GI/100
          Q1 += m.carbs * 1000 * (m.gi / 100);
          m.done = true;
        }
      }
      if (k % 2 === 0) out.push({ t, g: G });
      const walking = walks.some(w => t >= w.t && t < w.t + w.dur);
      const sgEff = p.SG + (walking ? 0.02 : 0);
      const Ra = AG * Q2 / TMAX;                       // mg/min
      const dQ1 = -Q1 / TMAX;
      const dQ2 = Q1 / TMAX - Q2 / TMAX;
      const dG = -(sgEff + X) * G + p.SG * p.Gb + Ra / BODY_DL;
      const dX = -p.p2 * X + p.p2 * p.SI * (I - p.Ib);
      const dI = -p.n * (I - p.Ib) + p.beta * Math.max(G - p.Gb, 0);
      Q1 += dQ1 * dt; Q2 += dQ2 * dt; G += dG * dt; X += dX * dt; I += dI * dt;
    }
    return out;
  }

  // uncertainty band: vary insulin sensitivity and secretion
  function band(profile, meals, opts = {}) {
    const mid = simulate(profile, meals, opts);
    const lo = simulate(profile, meals, { ...opts, override: { SI: profile.SI * 1.4, beta: profile.beta * 1.25 } });
    const hi = simulate(profile, meals, { ...opts, override: { SI: profile.SI * 0.7, beta: profile.beta * 0.8 } });
    return mid.map((d, i) => ({ t: d.t, g: d.g, lo: Math.min(lo[i].g, hi[i].g), hi: Math.max(lo[i].g, hi[i].g) }));
  }

  function summary(series, profile) {
    let peak = series[0], above180 = 0;
    for (const d of series) { if (d.g > peak.g) peak = d; if (d.g > 180) above180 += 1; }
    const at2h = series.find(d => d.t >= 120) || series[series.length - 1];
    return { peak: peak.g, peakAt: peak.t, rise: peak.g - profile.Gb, at2h: at2h.g, minutesAbove180: above180 * 1 };
  }

  const api = { PROFILES, simulate, band, summary };
  if (typeof module !== 'undefined') module.exports = api; else root.Manhana = api;
})(this);
