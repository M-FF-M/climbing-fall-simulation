
import numpy as np
import matplotlib.pyplot as plt

GRAVITY = 9.807

def free_fall_model(t0, h0, v0, mass, hend):
  tend = t0 + v0 / GRAVITY + np.sqrt(v0 ** 2 / (GRAVITY ** 2) + 2 * (h0 - hend) / GRAVITY) if v0 ** 2 / (GRAVITY ** 2) + 2 * (h0 - hend) / GRAVITY > 0 else t0
  vfct = np.vectorize(lambda t: v0 - GRAVITY * (t - t0))
  hfct = np.vectorize(lambda t: h0 + v0 * (t - t0) - GRAVITY / 2 * (t - t0) ** 2)
  ffct = np.vectorize(lambda t: mass * (-GRAVITY))
  return tend, hfct, vfct, ffct

def linear_spring_model(t0, h0, v0, mass, elasticity=0.079e-3, restlen=None, endtimemode='startheight'):
  if restlen is None:
    restlen = np.abs(h0)
  spring = 1 / (restlen * elasticity)
  omega = np.sqrt(spring / mass)
  tend = t0 + 1 / omega * (2 * np.pi + 2 * np.arctan(v0 * omega / GRAVITY))
  if endtimemode == 'lowestheight':
    tend = t0 + 1 / omega * (np.pi + np.arctan(v0 * omega / GRAVITY))
  vfct = np.vectorize(lambda t: v0 * np.cos(omega * (t - t0)) - GRAVITY / omega * np.sin(omega * (t - t0)))
  hfct = np.vectorize(lambda t: h0 + v0 / omega * np.sin(omega * (t - t0)) + GRAVITY / (omega ** 2) * (np.cos(omega * (t - t0)) - 1))
  ffct = np.vectorize(lambda t: mass * (-v0 * omega * np.sin(omega * (t - t0)) - GRAVITY * np.cos(omega * (t - t0))))
  return tend, hfct, vfct, ffct

def standard_linear_solid_model(t0, h0, v0, mass,
                                k1, k2, eta,
                                y0=0.0, gravity=GRAVITY, endtimemode="startheight",
                                max_time=None, n_scan=5000, return_internal=False):
    """
    Standard Linear Solid model:
      - spring 1 with stiffness k1 in parallel with
      - Maxwell arm: spring 2 with stiffness k2 in series with dashpot eta

    Coordinates:
      h(t) = height
      x(t) = h0 - h(t), displacement/compression from initial height
      y(t) = internal viscous extension in Maxwell arm

    Equations:
      m h'' = -m g + k1 x + k2 (x - y)
      eta y' = k2 (x - y)

    Initial conditions:
      h(t0) = h0
      h'(t0) = v0
      y(t0) = y0

    Returns:
      tend, hfct, vfct, ffct

    where:
      hfct(t) = h(t)
      vfct(t) = h'(t)
      ffct(t) = total force m h''(t)

    With return_internal=True, also returns yfct(t).
    """

    if mass <= 0:
        raise ValueError("mass must be positive.")
    if k1 <= 0:
        raise ValueError("k1 must be positive.")
    if k2 <= 0:
        raise ValueError("k2 must be positive.")
    if eta <= 0:
        raise ValueError("eta must be positive.")
    if y0 < 0:
        raise ValueError("y0 should be nonnegative for your stated model.")

    lam = k2 / eta

    # Equilibrium displacement:
    # x_eq = y_eq = m g / k1
    xeq = mass * gravity / k1

    # The cubic for the displacement deviation X = x - xeq is:
    #
    #   r^3 + lam r^2 + ((k1 + k2) / m) r + lam k1 / m = 0
    #
    roots = np.roots([
        1.0,
        lam,
        (k1 + k2) / mass,
        lam * k1 / mass,
    ])

    # Initial data for X = x - xeq.
    #
    # x(t0) = 0, so X(t0) = -xeq
    # x'(t0) = -v0
    # x''(t0) = g + (k2 / m) y0
    #
    S0 = -xeq
    S1 = -v0
    S2 = gravity + (k2 / mass) * y0

    # Solve for modal coefficients C_i such that
    #
    #   X(t) = sum_i C_i exp(r_i (t - t0)).
    #
    V = np.vstack([
        np.ones(3, dtype=complex),
        roots,
        roots**2,
    ])

    rhs = np.array([S0, S1, S2], dtype=complex)

    try:
        C = np.linalg.solve(V, rhs)
    except np.linalg.LinAlgError as exc:
        raise ValueError(
            "Repeated or nearly repeated characteristic roots were encountered. "
            "This simple modal implementation needs distinct roots."
        ) from exc

    # For each mode, the Maxwell internal variable satisfies
    #
    #   Y_i = lam / (r_i + lam) * C_i
    #
    # where Y = y - xeq.
    D = lam / (roots + lam) * C

    def _real_output(z):
        z = np.real_if_close(z, tol=1000)
        if np.iscomplexobj(z):
            z = z.real
        if np.ndim(z) == 0:
            return float(z)
        return z

    def _mode_sum(coeffs, t):
        t_arr = np.asarray(t, dtype=float)
        tau = np.expand_dims(t_arr - t0, axis=-1)
        val = np.sum(coeffs * np.exp(tau * roots), axis=-1)
        return _real_output(val)

    def xfct(t):
        return _real_output(xeq + _mode_sum(C, t))

    def yfct(t):
        return _real_output(xeq + _mode_sum(D, t))

    def hfct(t):
        return _real_output(h0 - xfct(t))

    def vfct(t):
        # v = h' = -x'
        return _real_output(-_mode_sum(roots * C, t))

    def afct(t):
        # a = h'' = -x''
        return _real_output(-_mode_sum((roots**2) * C, t))

    def ffct(t):
        # Total force, matching your original convention:
        # f = m a = -m g + k1 x + k2 (x - y)
        return _real_output(mass * afct(t))

    def _bisect_root(fun, a, b, max_iter=80):
        fa = fun(a)
        fb = fun(b)

        if abs(fa) < 1e-14:
            return a
        if abs(fb) < 1e-14:
            return b
        if fa * fb > 0:
            return np.nan

        lo, hi = a, b
        flo, fhi = fa, fb

        for _ in range(max_iter):
            mid = 0.5 * (lo + hi)
            fmid = fun(mid)

            if abs(fmid) < 1e-14:
                return mid

            if flo * fmid <= 0:
                hi = mid
                fhi = fmid
            else:
                lo = mid
                flo = fmid

        return 0.5 * (lo + hi)

    def _default_search_horizon():
        decay_rates = -np.real(roots)
        positive_decay_rates = decay_rates[decay_rates > 1e-12]

        if len(positive_decay_rates) == 0:
            tau_decay = 1.0
        else:
            tau_decay = 1.0 / np.min(positive_decay_rates)

        freqs = np.abs(np.imag(roots))
        positive_freqs = freqs[freqs > 1e-12]

        if len(positive_freqs) == 0:
            tau_osc = tau_decay
        else:
            tau_osc = 2.0 * np.pi / np.max(positive_freqs)

        return 50.0 * max(tau_decay, tau_osc)

    def _find_first_startheight_return():
        if max_time is None:
            tau_max = _default_search_horizon()
            tmax = t0 + tau_max
        else:
            tmax = max_time

        tau_scale = max(1.0, abs(tmax - t0))
        eps = 1e-10 * tau_scale

        ts = np.linspace(t0 + eps, tmax, n_scan)
        vals = hfct(ts) - h0

        prev_t = ts[0]
        prev_v = vals[0]

        for curr_t, curr_v in zip(ts[1:], vals[1:]):
            if prev_v == 0.0:
                return prev_t

            if prev_v * curr_v < 0:
                return _bisect_root(lambda s: hfct(s) - h0, prev_t, curr_t)

            prev_t = curr_t
            prev_v = curr_v

        return np.nan

    def _find_first_lowestheight():
        if max_time is None:
            tau_max = _default_search_horizon()
            tmax = t0 + tau_max
        else:
            tmax = max_time

        tau_scale = max(1.0, abs(tmax - t0))
        eps = 1e-10 * tau_scale

        ts = np.linspace(t0 + eps, tmax, n_scan)
        vals = vfct(ts)

        prev_t = ts[0]
        prev_v = vals[0]

        for curr_t, curr_v in zip(ts[1:], vals[1:]):
            if prev_v * curr_v < 0:
                root = _bisect_root(vfct, prev_t, curr_t)

                # A local minimum of h has h'' > 0.
                if afct(root) > 0:
                    return root

            prev_t = curr_t
            prev_v = curr_v

        return np.nan

    if endtimemode == "startheight":
        tend = _find_first_startheight_return()
    elif endtimemode == "lowestheight":
        tend = _find_first_lowestheight()
    elif endtimemode in (None, "none"):
        tend = np.nan
    else:
        raise ValueError(
            "endtimemode must be 'startheight', 'lowestheight', None, or 'none'."
        )

    if return_internal:
        return tend, hfct, vfct, ffct, yfct

    return tend, hfct, vfct, ffct

def get_sls_parameters(h0, elasticity1=0.079e-3, elasticity2=None, viscosity=None, restlen=None, p=0.3, t=0.1):
  if restlen is None:
    restlen = np.abs(h0)
  elasticity = elasticity1
  if elasticity2 is None:
    elasticity1 = elasticity / p
    elasticity2 = elasticity / (1 - p)
  else:
    elasticity = (elasticity1 * elasticity2) / (elasticity1 + elasticity2)
  if viscosity is None:
    viscosity = t * (1 - p) / elasticity
  return 1 / (restlen * elasticity1), 1 / (restlen * elasticity2), viscosity / restlen, 1 / (restlen * elasticity)

def sls_model(t0, h0, v0, mass, elasticity1=0.079e-3, elasticity2=None, viscosity=None, restlen=None, endtimemode='startheight'):
  if restlen is None:
    restlen = np.abs(h0)
  x0 = -restlen - h0 if -restlen - h0 > 0 else 0
  k1, k2, eta, _ = get_sls_parameters(h0, elasticity1, elasticity2, viscosity, restlen)
  return standard_linear_solid_model(t0, h0, v0, mass, k1, k2, eta, x0, endtimemode=endtimemode)

deb_print = 0
def debug_print(*args):
  global deb_print
  if deb_print < 500:
    print(*args)
    deb_print += 1

def hybrid_rope_model(t0, h0, mass, elasticity1=0.079e-3, elasticity2=None, viscosity=None, tend=4, tres=0.00001, captres=0.01, restlen=None):
  if restlen is None:
    restlen = h0
  k1, k2, eta, k = get_sls_parameters(-h0, elasticity1, elasticity2, viscosity, restlen)
  ct = t0
  ch = h0
  cv = 0
  cx = max(0.0, -restlen - ch)
  cy = cx
  cy_reboundstart = cy
  laststep = 'fall'
  lastcapt = 0
  times = [ct]
  heights = [ch]
  speeds = [cv]
  forces = [0]
  while ct < tend:
    cf = 0
    if ch >= -restlen: # rope not taut => free fall
      cf = mass * (-GRAVITY)
      laststep = 'fall'
    elif cv < 0: # moving downwards, rope taut => linear spring model
      cf = mass * (-GRAVITY) + max(0.0, k * cx)
      laststep = 'linear'
    else: # moving upwards, rope taut => SLS model
      if laststep != 'sls':
        cy = cx
        cy_reboundstart = cy
      linear_force = mass * (-GRAVITY) + max(0.0, k * cx)
      sls_force = mass * (-GRAVITY) + max(0.0, k1 * cx + k2 * (cx - cy))
      def weighter(x):
        x = min(max(x, 0.0), 1.0)
        return 1 - (1 - x) ** 5
      grad_frac = 0.6
      sls_weight = 1.0 if cx < grad_frac * cy_reboundstart else weighter((cy_reboundstart - cx) / ((1 - grad_frac) * cy_reboundstart))
      cf = (1 - sls_weight) * linear_force + sls_weight * sls_force
      cy += k2 / eta * (cx - cy) * tres
      cy = max(0.0, cy)
      laststep = 'sls'
    ca = cf / mass
    cv += ca * tres
    ch += cv * tres
    cx = max(0.0, -restlen - ch)
    ct += tres
    if ct - lastcapt >= captres:
      times.append(ct)
      heights.append(ch)
      speeds.append(cv)
      forces.append(cf)
  return np.array(times), np.array(heights), np.array(speeds), np.array(forces)

def linear_rope_model(t0, h0, mass, elasticity=0.079e-3, tend=4, mode='linear'):
  times = np.linspace(t0, tend, 500)
  heights = np.full_like(times, np.nan, dtype=float)
  speeds = np.full_like(times, np.nan, dtype=float)
  forces = np.full_like(times, np.nan, dtype=float)
  currt = t0
  currh = h0
  currv = 0
  fall_mode = True
  while currt < tend:
    if fall_mode:
      newt, hfct, vfct, ffct = free_fall_model(currt, currh, currv, mass, -h0)
      if np.isnan(newt):
        newt = tend
      mask = (times >= currt) & (times <= newt)
      heights[mask] = hfct(times[mask])
      speeds[mask] = vfct(times[mask])
      forces[mask] = ffct(times[mask])
      currh = hfct(newt)
      currv = vfct(newt)
      fall_mode = False
      currt = newt
    else:
      if mode == 'linear':
        newt, hfct, vfct, ffct = linear_spring_model(currt, currh, currv, mass, elasticity, h0)
      else:
        newt, hfct, vfct, ffct = sls_model(currt, currh, currv, mass, elasticity, restlen=h0)
      if np.isnan(newt):
        newt = tend
      mask = (times >= currt) & (times <= newt)
      heights[mask] = hfct(times[mask])
      speeds[mask] = vfct(times[mask])
      forces[mask] = ffct(times[mask])
      currh = hfct(newt)
      currv = vfct(newt)
      fall_mode = True
      currt = newt
  return times, heights, speeds, forces

def linear_crossing_time(x0, x1, y0, y1, threshold):
    """Linearly interpolate the x value where y crosses threshold."""
    if y1 == y0:
        return float(x1)
    frac = (threshold - y0) / (y1 - y0)
    return float(x0 + frac * (x1 - x0))

def estimate_spring_constant(elongation, forces, plot=True, otherconstants=[]):
    """
    Estimate spring constant k for a linear spring model F = k*x,
    with the fitted line constrained to pass through the origin.

    Parameters
    ----------
    elongation : np.ndarray
        Spring extension in meters.
    forces : np.ndarray
        Spring force in kN.
    plot : bool
        Whether to plot the data and fitted line.

    Returns
    -------
    k : float
        Estimated spring constant in kN/m.
    """

    x = np.asarray(elongation, dtype=float)
    F = np.asarray(forces, dtype=float)

    if x.shape != F.shape:
        raise ValueError("elongation and forces must have the same shape")

    # Remove NaNs / infinities
    mask = np.isfinite(x) & np.isfinite(F)
    x = x[mask]
    F = F[mask]

    if len(x) == 0:
        raise ValueError("No valid data points")

    if np.allclose(x, 0):
        raise ValueError("All elongation values are zero; cannot estimate k")

    # Least-squares estimate for F = k*x
    k = np.dot(x, F) / np.dot(x, x)

    if plot:
        x_fit = np.linspace(0, np.max(x), 200)
        F_fit = k * x_fit

        plt.figure()
        plt.scatter(x, F, label="Data")
        plt.plot(x_fit, F_fit, label=f"Fit: F = {k:.3g} x")
        for idx, kalt in enumerate(otherconstants):
          plt.plot(x_fit, kalt * x_fit, label='Alternative %d' % (idx + 1))
        plt.xlabel("Elongation [m]")
        plt.ylabel("Force [kN]")
        plt.title("Linear spring fit through origin")
        plt.legend()
        plt.grid(True)
        plt.show()

    return k

def analyse_uiaa_data(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, elongation_m, zero_displacement, maxf_fil_kn, maxf_unfil_kn, dyne, state, force_rise_time):
  plot_results = True
  max_elongation = 0.95 * np.max(elongation_m)
  low_displacement = zero_displacement - max_elongation
  idx_taut = np.flatnonzero(displacement_m < zero_displacement)[0]
  idx_low = np.flatnonzero(displacement_m < low_displacement)[0]
  time_taut = linear_crossing_time(time_s[idx_taut - 1], time_s[idx_taut], displacement_m[idx_taut - 1], displacement_m[idx_taut], zero_displacement)
  times_linrop = time_s[idx_taut:idx_low] - time_taut
  elongation_linrop = elongation_m[idx_taut:idx_low]
  forces_linrop = force_unfiltered_kn[idx_taut:idx_low]

  idx_event = np.flatnonzero(time_s > force_rise_time)[0]
  length_taut = linear_crossing_time(displacement_m[idx_event - 1], displacement_m[idx_event], time_s[idx_event - 1], time_s[idx_event], force_rise_time)
  rope_length = 0.3 + np.sqrt(0.08 ** 2 + length_taut ** 2)
  rope_length_uiaa = 0.3 + np.sqrt(0.08 ** 2 + 2.5 ** 2)
  maxelong1 = np.max(elongation_m)
  maxelong2 = maxelong1 + (-zero_displacement - 2.5)
  maxelong3 = maxelong1 + (-zero_displacement - np.abs(length_taut))
  rope_length_stat = 2.8 / (1 + state / 100)

  # print('Max. unfiltered force reported in CSV: %.5g kN' % maxf_unfil_kn)
  # print('Max. filtered force reported in CSV: %.5g kN' % maxf_fil_kn)

  # print('Maximal elongation: %.5g m' % maxelong1)
  # print('Maximal elongation below -2.5 m: %.5g m' % maxelong2)
  # print('Estimated rest height: %.5g m' % length_taut)
  # print('Maximal elongation estimated: %.5g m' % maxelong3)
  # print('Calculated dynamic elongation: %.5g %%' % (100 * maxelong2 / rope_length_uiaa))
  # print('Estimated dynamic elongation: %.5g %%' % (100 * maxelong3 / rope_length))
  # print('Required rest lengths for elongation reported in CSV: %.5g m / %.5g m / %.5g m' % (maxelong1 / (dyne / 100), maxelong2 / (dyne / 100), maxelong3 / (dyne / 100)))
  # print('Estimated rest length: %.5g m' % rope_length)
  
  print('Rest length, estimated by static elongation: %.5g m' % rope_length_stat)
  print('Dynamic elongation reported in CSV: %.5g %%, derived from data: %.5g %%' % (dyne, 100 * maxelong2 / 2.8))
  print('Corrected dynamic elongation: %.5g %% (rest length used %.5g m) / %.5g %% (fix rest length 2.3 m)' % (100 * (dyne / 100 * 2.8 + 2.5 + zero_displacement) / (0.3 - zero_displacement), -zero_displacement, 100 * (dyne / 100 * 2.8 + 0.2) / 2.6))
  print('Estimated dynamic elongation: %.5g %% (estimated rest length %.5g m) / %.5g %% (rest length used %.5g m)' % (100 * maxelong3 / rope_length, np.abs(length_taut), 100 * maxelong1 / (0.3 - zero_displacement), -zero_displacement))

  estimated_dyne = (dyne / 100 * 2.8 + 2.5 + zero_displacement) / (0.3 - zero_displacement)
  estimated_state = (state / 100)
  kdyne = maxf_unfil_kn / (estimated_dyne * (0.3-zero_displacement)) # TODO check if correct computation
  kdyne2 = maxf_fil_kn / (estimated_dyne * (0.3-zero_displacement)) # TODO check if correct computation
  kstate = (80.0 * GRAVITY / 1000.0) / (estimated_state * (0.3-zero_displacement)) # TODO check if correct computation
  k = estimate_spring_constant(elongation_linrop, forces_linrop, plot_results, [kdyne, kdyne2, kstate])
  elasticity = 1 / (-zero_displacement * k * 1000.0)
  
  mass = 80.0
  height0 = 2.3
  times, heights, speeds, forces = hybrid_rope_model(0, height0, mass, elasticity, restlen=(-zero_displacement))
  add_grav = np.vectorize(lambda f : f + GRAVITY * mass)
  rope_forces = add_grav(forces)
  rope_ext = np.maximum(zero_displacement - heights, 0.0)

  if plot_results:
    plt.figure(figsize=(9, 6))
    plt.plot(time_s, displacement_m, label='data')
    plt.plot(times, heights, label='model')
    plt.plot([0, 4], [zero_displacement, zero_displacement])
    ax = plt.gca()
    ax.yaxis.grid(color='gray', which='major', linestyle='-')
    ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
    ax.xaxis.grid(color='gray', which='major', linestyle='-')
    ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
    plt.minorticks_on()
    plt.legend()
    plt.xlabel("Time [s]")
    plt.ylabel("Height [m]")
    plt.title("UIAA fall: height of the falling mass")

    plt.figure(figsize=(9, 6))
    plt.plot(time_s, force_unfiltered_kn, label='data')
    plt.plot(times, rope_forces / 1000.0, label='model')
    ax = plt.gca()
    ax.yaxis.grid(color='gray', which='major', linestyle='-')
    ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
    ax.xaxis.grid(color='gray', which='major', linestyle='-')
    ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
    plt.minorticks_on()
    plt.legend()
    plt.xlabel("Time [s]")
    plt.ylabel("Force [kN]")
    plt.title("UIAA fall: force between rope and falling mass")

    plt.figure(figsize=(9, 6))
    plt.plot(elongation_m, force_unfiltered_kn, label='data')
    plt.plot(rope_ext, rope_forces / 1000.0, label='model')
    ax = plt.gca()
    ax.yaxis.grid(color='gray', which='major', linestyle='-')
    ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
    ax.xaxis.grid(color='gray', which='major', linestyle='-')
    ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
    plt.minorticks_on()
    plt.legend()
    plt.xlabel("Rope elongation [m]")
    plt.ylabel("Force [kN]")
    plt.title("UIAA fall: elongation-force plot")

    plt.show()

if __name__ == "__main__":
  # times = np.linspace(0, 2, 60)
  # hend = -2.3
  # tend, hfct, vfct, ffct = free_fall_model(0, -2.3, 5, 80, hend)
  # tend, hfct, vfct, ffct = linear_spring_model(0, -2.3, -6, 80)
  mass = 80.0
  height0 = 2.3
  times, heights, speeds, forces = hybrid_rope_model(0, height0, mass)
  add_grav = np.vectorize(lambda f : f + GRAVITY * mass)
  rope_forces = add_grav(forces)
  rope_ext = np.maximum(-height0 - heights, 0.0)

  plt.figure(figsize=(9, 6))
  plt.plot(times, heights)
  plt.plot([0, 4], [-2.3, -2.3])
  ax = plt.gca()
  ax.yaxis.grid(color='gray', which='major', linestyle='-')
  ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
  ax.xaxis.grid(color='gray', which='major', linestyle='-')
  ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
  plt.minorticks_on()
  plt.xlabel("Time [s]")
  plt.ylabel("Height [m]")
  plt.title("UIAA fall: height of the falling mass")

  plt.figure(figsize=(9, 6))
  plt.plot(times, rope_forces / 1000.0)
  ax = plt.gca()
  ax.yaxis.grid(color='gray', which='major', linestyle='-')
  ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
  ax.xaxis.grid(color='gray', which='major', linestyle='-')
  ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
  plt.minorticks_on()
  plt.xlabel("Time [s]")
  plt.ylabel("Force [kN]")
  plt.title("UIAA fall: force between rope and falling mass")

  plt.figure(figsize=(9, 6))
  plt.plot(rope_ext, rope_forces / 1000.0)
  ax = plt.gca()
  ax.yaxis.grid(color='gray', which='major', linestyle='-')
  ax.yaxis.grid(color='gray', which='minor', linestyle='dashed')
  ax.xaxis.grid(color='gray', which='major', linestyle='-')
  ax.xaxis.grid(color='gray', which='minor', linestyle='dashed')
  plt.minorticks_on()
  plt.xlabel("Rope elongation [m]")
  plt.ylabel("Force [kN]")
  plt.title("UIAA fall: elongation-force plot")

  plt.show()
