from pathlib import Path
import csv
import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# -----------------------------------------------------------------------------
# User settings
# -----------------------------------------------------------------------------

CSV_PATH = Path("1_Report_EN892_Einfachseil_d9,2mm.csv")
# CSV_PATH = Path("2_Report_EN892_Einfachseil_d8,7mm.csv")
# CSV_PATH = Path("3_Report_EN892_Einfachseil_d9,8mm.csv")
# CSV_PATH = Path("4_Report_EN892_Einfachseil_d8,9mm.csv")
PDF_PATH = Path("uiaa_fall_force_displacement_plots.pdf")

G = 9.80665
START_HEIGHT_M = 2.3
ELONGATION_THRESHOLD_M = -2.3
ELONGATION_THRESHOLD_MM = 1000.0 * ELONGATION_THRESHOLD_M

# Displacement interpolation method. "pchip" is a shape-preserving piecewise
# cubic interpolation and is preferred here. If SciPy is not installed, the
# script automatically falls back to linear interpolation.
INTERPOLATION_METHOD = "pchip"  # choose "pchip" or "linear"

# Force-rise detection settings. These defaults work for the attached UIAA
# norm-fall CSV. Adjust them if a different recording has a different timing or
# noise level.
FORCE_RISE_SEARCH_START_S = 0.65
FORCE_RISE_SEARCH_END_S = 1.10
FORCE_BASELINE_END_S = 0.75
FORCE_SMOOTHING_WINDOW_S = 0.010
FORCE_RISE_HOLD_DURATION_S = 0.010
FORCE_RISE_MIN_THRESHOLD_KN = 0.15
FORCE_RISE_SIGMA_MULTIPLIER = 6.0
FORCE_ONSET_MIN_THRESHOLD_KN = 0.04
FORCE_ONSET_SIGMA_MULTIPLIER = 2.0


# -----------------------------------------------------------------------------
# Basic helpers
# -----------------------------------------------------------------------------

def parse_decimal(value):
    """Parse decimal-comma values used in the CSV."""
    value = value.strip()
    if not value:
        return np.nan
    return float(value.replace(",", "."))


def read_csv_columns(csv_file_path):
    """Read force time, force, and displacement columns from the CSV file."""
    csv_file_path = Path(csv_file_path)
    rows = []

    with csv_file_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        header = next(reader, None)
        for row in reader:
            if len(row) < 6:
                continue
            try:
                rows.append([
                    parse_decimal(row[1]),  # time [s]
                    parse_decimal(row[2]),  # force unfiltered [kN]
                    parse_decimal(row[3]),  # force filtered [kN]
                    parse_decimal(row[5]),  # displacement [mm]
                ])
            except ValueError:
                continue

    if not rows:
        raise ValueError(f"No numeric rows found in {csv_file_path}")

    data = np.asarray(rows, dtype=float)
    return {
        "force_time_csv_s": data[:, 0],
        "force_unfiltered_kn": data[:, 1],
        "force_filtered_kn": data[:, 2],
        "displacement_mm_all": data[:, 3],
    }


def moving_average(y, window_samples):
    window_samples = int(max(1, window_samples))
    kernel = np.ones(window_samples, dtype=float) / window_samples
    return np.convolve(y, kernel, mode="same")


def robust_sigma(y):
    """Robust noise estimate based on the median absolute deviation."""
    med = np.nanmedian(y)
    mad = np.nanmedian(np.abs(y - med))
    return 1.4826 * mad


def extract_displacement_samples(displacement_mm_all):
    """
    In this CSV, the displacement channel is populated at the beginning and then
    zero-filled afterwards. Keep everything up to the last nonzero sample.
    """
    valid_disp_idx = np.flatnonzero((~np.isnan(displacement_mm_all)) & (displacement_mm_all != 0))
    if valid_disp_idx.size == 0:
        raise ValueError("No nonzero displacement samples found.")

    last_valid_disp_idx = int(valid_disp_idx[-1])
    displacement_mm = displacement_mm_all[: last_valid_disp_idx + 1]

    if np.any(np.isnan(displacement_mm)):
        raise ValueError("The displacement sequence contains NaN values before the last valid sample.")

    return displacement_mm


def first_threshold_crossing_index(y, threshold):
    """
    Return the fractional sample index where y first crosses below threshold.
    The fractional index is computed by linear interpolation between the two
    samples bracketing the threshold.
    """
    below = np.flatnonzero(y < threshold)
    if below.size == 0:
        raise ValueError(f"The displacement never crosses below {threshold}.")

    i1 = int(below[0])
    if i1 == 0:
        return 0.0, i1

    i0 = i1 - 1
    y0 = y[i0]
    y1 = y[i1]
    if y1 == y0:
        frac = 0.0
    else:
        frac = (threshold - y0) / (y1 - y0)

    return i0 + frac, i1


# -----------------------------------------------------------------------------
# Physics and alignment helpers
# -----------------------------------------------------------------------------

def fit_regular_displacement_timing(displacement_mm):
    """
    Estimate the regular displacement sampling interval from the free-fall part.

    The fit uses all displacement samples before the first sample below -2.3 m.
    With regular sampling, the free-fall model can be written as

        h_n = A + B*n + C*n^2
            = H_release - 0.5*g*(t_first + n*dt)^2.

    Therefore C = -0.5*g*dt^2, so dt = sqrt(-2*C/g). The same fit also gives
    t_first = -B/(g*dt), the time after release at which the first displacement
    sample was taken.
    """
    crossing_sample_index, first_below_index = first_threshold_crossing_index(
        displacement_mm,
        ELONGATION_THRESHOLD_MM,
    )

    fit_displacement_mm = displacement_mm[:first_below_index]
    if fit_displacement_mm.size < 4:
        raise ValueError("Too few free-fall displacement samples for a quadratic fit.")

    n = np.arange(fit_displacement_mm.size, dtype=float)
    h_m = fit_displacement_mm / 1000.0

    X = np.column_stack([np.ones_like(n), n, n**2])
    A, B, C = np.linalg.lstsq(X, h_m, rcond=None)[0]

    if C >= 0:
        raise ValueError("Quadratic fit did not produce a free-fall curvature.")

    dt_s = math.sqrt(-2.0 * C / G)
    first_displacement_time_after_release_s = -B / (G * dt_s)
    fitted_release_height_m = A + 0.5 * G * first_displacement_time_after_release_s**2

    fitted_h_m = A + B * n + C * n**2
    residual_mm = 1000.0 * (h_m - fitted_h_m)

    crossing_time_after_release_s = (
        first_displacement_time_after_release_s + crossing_sample_index * dt_s
    )

    return {
        "dt_s": float(dt_s),
        "sample_rate_hz": float(1.0 / dt_s),
        "first_displacement_time_after_release_s": float(first_displacement_time_after_release_s),
        "crossing_sample_index": float(crossing_sample_index),
        "crossing_time_after_release_s": float(crossing_time_after_release_s),
        "first_below_index": int(first_below_index),
        "fit_sample_count": int(fit_displacement_mm.size),
        "last_included_displacement_mm": float(fit_displacement_mm[-1]),
        "first_excluded_displacement_mm": float(displacement_mm[first_below_index]),
        "fitted_release_height_m": float(fitted_release_height_m),
        "rms_residual_mm": float(np.sqrt(np.mean(residual_mm**2))),
        "max_abs_residual_mm": float(np.max(np.abs(residual_mm))),
    }


def detect_force_rise_time(force_time_csv_s, force_unfiltered_kn):
    """
    Estimate when the rope becomes taut from the unfiltered force trace.

    The signal is smoothed over a short moving-average window. A baseline median
    and robust baseline sigma are computed before the expected impact. The code
    first finds a sustained crossing of a conservative force threshold, then
    backtracks to a lower onset threshold and linearly interpolates the threshold
    crossing time.
    """
    dt_force_s = float(np.nanmedian(np.diff(force_time_csv_s)))
    window_samples = max(1, int(round(FORCE_SMOOTHING_WINDOW_S / dt_force_s)))
    hold_samples = max(1, int(round(FORCE_RISE_HOLD_DURATION_S / dt_force_s)))

    force_smooth_kn = moving_average(force_unfiltered_kn, window_samples)

    baseline_mask = force_time_csv_s <= FORCE_BASELINE_END_S
    if not np.any(baseline_mask):
        raise ValueError("No force samples in the baseline interval.")

    baseline = force_smooth_kn[baseline_mask]
    baseline_median_kn = float(np.nanmedian(baseline))
    baseline_sigma_kn = float(robust_sigma(baseline))

    rise_threshold_kn = baseline_median_kn + max(
        FORCE_RISE_MIN_THRESHOLD_KN,
        FORCE_RISE_SIGMA_MULTIPLIER * baseline_sigma_kn,
    )
    onset_threshold_kn = baseline_median_kn + max(
        FORCE_ONSET_MIN_THRESHOLD_KN,
        FORCE_ONSET_SIGMA_MULTIPLIER * baseline_sigma_kn,
    )

    search_indices = np.flatnonzero(
        (force_time_csv_s >= FORCE_RISE_SEARCH_START_S)
        & (force_time_csv_s <= FORCE_RISE_SEARCH_END_S)
    )
    if search_indices.size == 0:
        raise ValueError("No force samples in the force-rise search interval.")

    sustained_crossing_index = None
    for i in search_indices:
        if i + hold_samples > force_smooth_kn.size:
            break
        if np.all(force_smooth_kn[i : i + hold_samples] > rise_threshold_kn):
            sustained_crossing_index = int(i)
            break

    if sustained_crossing_index is None:
        raise ValueError(
            "Could not detect a sustained force rise. Try lowering "
            "FORCE_RISE_MIN_THRESHOLD_KN or widening the search interval."
        )

    # Backtrack to the lower onset threshold.
    j = sustained_crossing_index
    while j > 0 and force_smooth_kn[j] > onset_threshold_kn:
        j -= 1

    # Now j is the last sample at/below the onset threshold, and j+1 is above it.
    if j + 1 < force_time_csv_s.size:
        x0 = force_time_csv_s[j]
        x1 = force_time_csv_s[j + 1]
        y0 = force_smooth_kn[j]
        y1 = force_smooth_kn[j + 1]
        if y1 != y0:
            taut_time_csv_s = x0 + (onset_threshold_kn - y0) * (x1 - x0) / (y1 - y0)
        else:
            taut_time_csv_s = x1
        onset_index = j + 1
    else:
        taut_time_csv_s = force_time_csv_s[j]
        onset_index = j

    return {
        "taut_time_csv_s": float(taut_time_csv_s),
        "onset_index": int(onset_index),
        "sustained_crossing_index": int(sustained_crossing_index),
        "sustained_crossing_time_csv_s": float(force_time_csv_s[sustained_crossing_index]),
        "baseline_median_kn": float(baseline_median_kn),
        "baseline_sigma_kn": float(baseline_sigma_kn),
        "rise_threshold_kn": float(rise_threshold_kn),
        "onset_threshold_kn": float(onset_threshold_kn),
        "smoothing_window_samples": int(window_samples),
        "hold_samples": int(hold_samples),
    }


def interpolate_displacement(sample_time_s, displacement_m, target_time_s, method=INTERPOLATION_METHOD):
    """
    Interpolate displacement samples to the force time grid.

    PCHIP is preferred because it is a shape-preserving piecewise cubic. It can
    follow curved free-fall and later curved rebound/compression sections without
    the overshoot risk of a global cubic spline. If SciPy is unavailable, the
    function falls back to linear interpolation.
    """
    method = method.lower()

    if method == "pchip":
        try:
            from scipy.interpolate import PchipInterpolator

            interpolator = PchipInterpolator(sample_time_s, displacement_m, extrapolate=False)
            out = interpolator(target_time_s)
            out = np.asarray(out, dtype=float)
            out[(target_time_s < sample_time_s[0]) | (target_time_s > sample_time_s[-1])] = np.nan
            return out, "pchip"
        except ImportError:
            print("SciPy is not installed; falling back to linear displacement interpolation.")
            method = "linear"

    if method == "linear":
        out = np.interp(target_time_s, sample_time_s, displacement_m, left=np.nan, right=np.nan)
        return out, "linear"

    raise ValueError('INTERPOLATION_METHOD must be either "pchip" or "linear".')


# -----------------------------------------------------------------------------
# Main extraction function requested by the user
# -----------------------------------------------------------------------------

def read_uiaa_fall_csv(csv_file_path, verbose=True):
    """
    Read the CSV file and align force and displacement using the force_taut mode.

    Returns four lists, all of the same length:
        1. time_s: release-based time in seconds, where t=0 is mass release
        2. force_filtered_kn: filtered force from the CSV, unchanged
        3. force_unfiltered_kn: unfiltered force from the CSV, unchanged
        4. displacement_m: displacement interpolated to time_s, in meters

    The alignment works as follows:
        - estimate the displacement sampling interval from free fall;
        - detect when the force starts to rise, i.e. when the rope becomes taut;
        - align that force-rise time with the displacement crossing -2.3 m;
        - infer the CSV force-time value corresponding to mass release;
        - subtract that CSV release time from the CSV force times.
    """
    columns = read_csv_columns(csv_file_path)
    force_time_csv_s = columns["force_time_csv_s"]
    force_unfiltered_kn = columns["force_unfiltered_kn"]
    force_filtered_kn = columns["force_filtered_kn"]
    displacement_mm = extract_displacement_samples(columns["displacement_mm_all"])

    timing = fit_regular_displacement_timing(displacement_mm)
    force_rise = detect_force_rise_time(force_time_csv_s, force_unfiltered_kn)

    # Match: displacement reaches -2.3 m <-> force starts to rise.
    release_csv_time_s = (
        force_rise["taut_time_csv_s"] - timing["crossing_time_after_release_s"]
    )

    # Returned force times are relative to mass release.
    time_s = force_time_csv_s - release_csv_time_s

    # Displacement sample times on the same release-based clock.
    n_disp = np.arange(displacement_mm.size, dtype=float)
    displacement_sample_time_s = (
        timing["first_displacement_time_after_release_s"] + n_disp * timing["dt_s"]
    )
    displacement_m_samples = displacement_mm / 1000.0

    displacement_m, interpolation_used = interpolate_displacement(
        displacement_sample_time_s,
        displacement_m_samples,
        time_s,
        method=INTERPOLATION_METHOD,
    )

    if verbose:
        print("Displacement timing estimate")
        print(f"  samples used for free-fall fit: {timing['fit_sample_count']}")
        print(
            "  last included / first excluded displacement: "
            f"{timing['last_included_displacement_mm']:.0f} mm / "
            f"{timing['first_excluded_displacement_mm']:.0f} mm"
        )
        print(f"  displacement sample interval: {1000.0 * timing['dt_s']:.6f} ms")
        print(f"  displacement sample rate:     {timing['sample_rate_hz']:.6f} Hz")
        print(f"  fitted release height:        {timing['fitted_release_height_m']:.6f} m")
        print(f"  fit RMS residual:             {timing['rms_residual_mm']:.6f} mm")
        print(f"  fit max abs residual:         {timing['max_abs_residual_mm']:.6f} mm")
        print()
        print("Force-rise detection")
        print(f"  baseline median force:        {force_rise['baseline_median_kn']:.6f} kN")
        print(f"  baseline robust sigma:        {force_rise['baseline_sigma_kn']:.6f} kN")
        print(f"  onset threshold:              {force_rise['onset_threshold_kn']:.6f} kN")
        print(f"  sustained-rise threshold:     {force_rise['rise_threshold_kn']:.6f} kN")
        print(f"  sustained crossing CSV time:  {force_rise['sustained_crossing_time_csv_s']:.6f} s")
        print(f"  taut-rope CSV time:           {force_rise['taut_time_csv_s']:.6f} s")
        print()
        print("Force/displacement alignment")
        print(
            "  displacement reaches -2.3 m at release-based time: "
            f"{timing['crossing_time_after_release_s']:.6f} s"
        )
        print(
            "  CSV force time determined as mass release: "
            f"{release_csv_time_s:.6f} s"
        )
        print("  This CSV time is mapped to t = 0.000000 s in the returned time list.")
        print(f"  displacement interpolation used: {interpolation_used}")
        print()

    return (
        time_s.tolist(),
        force_filtered_kn.tolist(),
        force_unfiltered_kn.tolist(),
        displacement_m.tolist(),
    )


# -----------------------------------------------------------------------------
# Plotting
# -----------------------------------------------------------------------------

def plot_uiaa_results(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, pdf_path=PDF_PATH):
    time_s = np.asarray(time_s, dtype=float)
    force_filtered_kn = np.asarray(force_filtered_kn, dtype=float)
    force_unfiltered_kn = np.asarray(force_unfiltered_kn, dtype=float)
    displacement_m = np.asarray(displacement_m, dtype=float)

    elongation_m = np.maximum(0.0, ELONGATION_THRESHOLD_M - displacement_m)

    finite_disp = np.isfinite(displacement_m)
    finite_elongation = np.isfinite(elongation_m) & np.isfinite(force_unfiltered_kn)
    finite_force = np.isfinite(force_unfiltered_kn) & np.isfinite(force_filtered_kn)

    fig1 = plt.figure(figsize=(9, 6))
    plt.plot(elongation_m[finite_elongation], force_unfiltered_kn[finite_elongation], linewidth=1.2)
    plt.xlabel("Rope elongation [m]")
    plt.ylabel("Unfiltered force [kN]")
    plt.title("UIAA fall: unfiltered force vs. rope elongation")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()

    fig2 = plt.figure(figsize=(9, 6))
    plt.plot(time_s[finite_disp], displacement_m[finite_disp], linewidth=1.2)
    plt.axhline(ELONGATION_THRESHOLD_M, linestyle="--", linewidth=1.0)
    plt.xlabel("Time since release [s]")
    plt.ylabel("Displacement [m]")
    plt.title("UIAA fall: displacement vs. time")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()

    fig3 = plt.figure(figsize=(9, 6))
    plt.plot(time_s[finite_force], force_unfiltered_kn[finite_force], linewidth=1.0, label="Unfiltered force")
    plt.plot(time_s[finite_force], force_filtered_kn[finite_force], linewidth=1.2, label="Filtered force")
    plt.xlabel("Time since release [s]")
    plt.ylabel("Force [kN]")
    plt.title("UIAA fall: force vs. time")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()

    with PdfPages(pdf_path) as pdf:
        pdf.savefig(fig1, bbox_inches="tight")
        pdf.savefig(fig2, bbox_inches="tight")
        pdf.savefig(fig3, bbox_inches="tight")

    print(f"Saved PDF: {pdf_path}")
    plt.show()


if __name__ == "__main__":
    time_s, force_filtered_kn, force_unfiltered_kn, displacement_m = read_uiaa_fall_csv(CSV_PATH)
    plot_uiaa_results(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, PDF_PATH)
