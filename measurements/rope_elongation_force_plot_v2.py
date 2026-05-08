from pathlib import Path
import csv
import math

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from rope_model import analyse_uiaa_data

# -----------------------------------------------------------------------------
# User settings
# -----------------------------------------------------------------------------

CSV_PATH = Path("1_Report_EN892_Einfachseil_d9,2mm.csv")
# CSV_PATH = Path("2_Report_EN892_Einfachseil_d8,7mm.csv")
# CSV_PATH = Path("3_Report_EN892_Einfachseil_d9,8mm.csv")
# CSV_PATH = Path("4_Report_EN892_Einfachseil_d8,9mm.csv")
PDF_PATH = Path("uiaa_fall_force_displacement_plots.pdf")

# Choose one of:
#   "minus_2300_to_force_rise"
#       Align the first displacement crossing of -2.300 m with the detected
#       beginning of the force rise.
#   "minus_static_to_force_rise"
#       Align the first displacement crossing of -(estimated height of unweighted rope, estimated by reported static elongation)
#       with the detected beginning of the force rise.
#   "minus_2500_to_weight_force"
#       Align the first displacement crossing of -2.500 m with the first time
#       the smoothed unfiltered force crosses 80 kg * g = 784.532 N.
ALIGNMENT_MODE = "minus_static_to_force_rise"

G = 9.80665
FALLING_MASS_KG = 80.0
BODY_WEIGHT_FORCE_KN = FALLING_MASS_KG * G / 1000.0

FREE_FALL_FIT_LIMIT_M = -2.3
FREE_FALL_FIT_LIMIT_MM = 1000.0 * FREE_FALL_FIT_LIMIT_M

TAUT_DISPLACEMENT_M = -2.3
TAUT_DISPLACEMENT_MM = 1000.0 * TAUT_DISPLACEMENT_M

STATIC_WEIGHT_DISPLACEMENT_M = -2.5
STATIC_WEIGHT_DISPLACEMENT_MM = 1000.0 * STATIC_WEIGHT_DISPLACEMENT_M

# Elongation is still measured relative to -2.300 m in both alignment modes.
ELONGATION_ZERO_DISPLACEMENT_M = -2.3
ELONGATION_ZERO_DISPLACEMENT_MM = 1000.0 * ELONGATION_ZERO_DISPLACEMENT_M

# Displacement interpolation method. PCHIP is a shape-preserving piecewise cubic
# interpolation and is preferred here. If SciPy is not installed, the script
# automatically falls back to linear interpolation.
INTERPOLATION_METHOD = "pchip"  # choose "pchip" or "linear"

# Force smoothing used only for event detection, never for the returned force
# lists or the plotted force traces.
FORCE_SMOOTHING_WINDOW_S = 0.010

# Settings for detecting the initial force rise.
FORCE_RISE_SEARCH_START_S = 0.65
FORCE_RISE_SEARCH_END_S = 1.10
FORCE_BASELINE_END_S = 0.75
FORCE_RISE_HOLD_DURATION_S = 0.010
FORCE_RISE_MIN_THRESHOLD_KN = 0.15
FORCE_RISE_SIGMA_MULTIPLIER = 6.0
FORCE_ONSET_MIN_THRESHOLD_KN = 0.04
FORCE_ONSET_SIGMA_MULTIPLIER = 2.0

# Settings for detecting the first crossing of body-weight force.
BODY_WEIGHT_SEARCH_START_S = 0.65
BODY_WEIGHT_SEARCH_END_S = 1.40


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

    next_force_filtered = False
    next_force_unfiltered = False
    next_dynamic_elongation = False
    next_static_elongation = False
    force_filtered = 0
    force_unfiltered = 0
    dynamic_elongation = 0
    static_elongation = 0
    with csv_file_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)  # header
        for row in reader:
            if len(row) >= 1:
                if next_force_filtered or next_force_unfiltered or next_dynamic_elongation or next_static_elongation:
                    val = 0
                    try:
                        val = float(row[0].replace(",", ".").replace("kN", "").replace("%", "").strip())
                    except:
                        pass
                    if next_force_filtered:
                        force_filtered = val
                    elif next_force_unfiltered:
                        force_unfiltered = val
                    elif next_dynamic_elongation:
                        dynamic_elongation = val
                    elif next_static_elongation:
                        static_elongation = val
                    next_force_filtered = False
                    next_force_unfiltered = False
                    next_dynamic_elongation = False
                    next_static_elongation = False
                elif row[0] == 'Force max. filtered' or row[0] == 'Force max, filtered':
                    next_force_filtered = True
                elif row[0] == 'Force max. unfiltered:' or row[0] == 'Force max, unfiltered:':
                    next_force_unfiltered = True
                elif row[0] == 'Dynamic Elongation:':
                    next_dynamic_elongation = True
                elif row[0] == 'Static Elongation:':
                    next_static_elongation = True
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
        "max_force_unfiltered_kn": force_unfiltered,
        "max_force_filtered_kn": force_filtered,
        "dynamic_elongation_percent": dynamic_elongation,
        "static_elongation_percent": static_elongation,
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


def linear_crossing_time(x0, x1, y0, y1, threshold):
    """Linearly interpolate the x value where y crosses threshold."""
    if y1 == y0:
        return float(x1)
    frac = (threshold - y0) / (y1 - y0)
    return float(x0 + frac * (x1 - x0))


def extract_displacement_samples(displacement_mm_all):
    """
    In this CSV, the displacement channel is populated at the beginning and then
    zero-filled afterwards. Keep everything up to the last nonzero sample.
    """
    valid = (~np.isnan(displacement_mm_all)) & (displacement_mm_all != 0)
    valid_disp_idx = np.flatnonzero(valid)
    if valid_disp_idx.size == 0:
        raise ValueError("No nonzero displacement samples found.")

    last_valid_disp_idx = int(valid_disp_idx[-1])
    displacement_mm = displacement_mm_all[: last_valid_disp_idx + 1]

    if np.any(np.isnan(displacement_mm)):
        raise ValueError("The displacement sequence contains NaN values before the last valid sample.")

    return displacement_mm


def first_downward_crossing_index(y, threshold):
    """
    Return the fractional sample index where y first crosses below threshold.
    The fractional index is computed by linear interpolation between the two
    samples bracketing the threshold.
    """
    below = np.flatnonzero(y < threshold)
    if below.size == 0:
        raise ValueError(f"The displacement never crosses below {threshold} mm.")

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

    return float(i0 + frac), i1


# -----------------------------------------------------------------------------
# Displacement timing
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
    _, first_below_index = first_downward_crossing_index(
        displacement_mm,
        FREE_FALL_FIT_LIMIT_MM,
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

    return {
        "dt_s": float(dt_s),
        "sample_rate_hz": float(1.0 / dt_s),
        "first_displacement_time_after_release_s": float(first_displacement_time_after_release_s),
        "fit_sample_count": int(fit_displacement_mm.size),
        "last_included_displacement_mm": float(fit_displacement_mm[-1]),
        "first_excluded_displacement_mm": float(displacement_mm[first_below_index]),
        "fitted_release_height_m": float(fitted_release_height_m),
        "rms_residual_mm": float(np.sqrt(np.mean(residual_mm**2))),
        "max_abs_residual_mm": float(np.max(np.abs(residual_mm))),
    }


def displacement_crossing_time_after_release(displacement_mm, timing_info, threshold_mm):
    """Return the release-based time at which displacement first crosses threshold_mm."""
    crossing_index, first_below_index = first_downward_crossing_index(displacement_mm, threshold_mm)
    crossing_time_s = (
        timing_info["first_displacement_time_after_release_s"]
        + crossing_index * timing_info["dt_s"]
    )
    return {
        "threshold_mm": float(threshold_mm),
        "crossing_sample_index": float(crossing_index),
        "first_below_index": int(first_below_index),
        "crossing_time_after_release_s": float(crossing_time_s),
        "sample_before_mm": float(displacement_mm[max(0, first_below_index - 1)]),
        "sample_after_mm": float(displacement_mm[first_below_index]),
    }


# -----------------------------------------------------------------------------
# Force-event detection
# -----------------------------------------------------------------------------

def smoothed_force_for_detection(force_time_csv_s, force_unfiltered_kn):
    dt_force_s = float(np.nanmedian(np.diff(force_time_csv_s)))
    window_samples = max(1, int(round(FORCE_SMOOTHING_WINDOW_S / dt_force_s)))
    return moving_average(force_unfiltered_kn, window_samples), window_samples


def detect_force_rise_time(force_time_csv_s, force_unfiltered_kn):
    """
    Estimate when the rope becomes taut from the unfiltered force trace.

    The signal is smoothed over a short moving-average window. A baseline median
    and robust baseline sigma are computed before the expected loading. The code
    first finds a sustained crossing of a conservative force threshold, then
    backtracks to a lower onset threshold and linearly interpolates that crossing.
    """
    force_smooth_kn, window_samples = smoothed_force_for_detection(
        force_time_csv_s,
        force_unfiltered_kn,
    )

    dt_force_s = float(np.nanmedian(np.diff(force_time_csv_s)))
    hold_samples = max(1, int(round(FORCE_RISE_HOLD_DURATION_S / dt_force_s)))

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
    for idx in search_indices:
        j_end = min(idx + hold_samples, force_smooth_kn.size)
        if j_end <= idx:
            continue
        if np.all(force_smooth_kn[idx:j_end] >= rise_threshold_kn):
            sustained_crossing_index = int(idx)
            break

    if sustained_crossing_index is None:
        raise ValueError("No sustained force rise found. Adjust the search or threshold settings.")

    onset_right = sustained_crossing_index
    while onset_right > 0 and force_smooth_kn[onset_right - 1] > onset_threshold_kn:
        onset_right -= 1

    onset_left = max(0, onset_right - 1)
    onset_time_s = linear_crossing_time(
        force_time_csv_s[onset_left],
        force_time_csv_s[onset_right],
        force_smooth_kn[onset_left],
        force_smooth_kn[onset_right],
        onset_threshold_kn,
    )

    return {
        "event_name": "force rise onset",
        "event_time_csv_s": float(onset_time_s),
        "sustained_crossing_time_csv_s": float(force_time_csv_s[sustained_crossing_index]),
        "baseline_median_kn": baseline_median_kn,
        "baseline_sigma_kn": baseline_sigma_kn,
        "rise_threshold_kn": float(rise_threshold_kn),
        "onset_threshold_kn": float(onset_threshold_kn),
        "smoothing_window_samples": int(window_samples),
        "hold_samples": int(hold_samples),
    }


def detect_body_weight_force_time(force_time_csv_s, force_unfiltered_kn):
    """
    Find the first time the smoothed unfiltered force reaches 80 kg * g.

    The crossing is found on the raw force scale in kN after moving-average
    smoothing. No baseline correction is applied because the requested target is
    an absolute force value, and the baseline in this file is already near zero.
    """
    force_smooth_kn, window_samples = smoothed_force_for_detection(
        force_time_csv_s,
        force_unfiltered_kn,
    )

    search_indices = np.flatnonzero(
        (force_time_csv_s >= BODY_WEIGHT_SEARCH_START_S)
        & (force_time_csv_s <= BODY_WEIGHT_SEARCH_END_S)
    )
    if search_indices.size == 0:
        raise ValueError("No force samples in the body-weight crossing search interval.")

    crossing_index = None
    for idx in search_indices:
        if force_smooth_kn[idx] >= BODY_WEIGHT_FORCE_KN:
            crossing_index = int(idx)
            break

    if crossing_index is None:
        raise ValueError(
            "No crossing of the body-weight force was found. Adjust BODY_WEIGHT_SEARCH_* settings."
        )

    left_index = max(0, crossing_index - 1)
    crossing_time_s = linear_crossing_time(
        force_time_csv_s[left_index],
        force_time_csv_s[crossing_index],
        force_smooth_kn[left_index],
        force_smooth_kn[crossing_index],
        BODY_WEIGHT_FORCE_KN,
    )

    return {
        "event_name": "body-weight force crossing",
        "event_time_csv_s": float(crossing_time_s),
        "target_force_kn": float(BODY_WEIGHT_FORCE_KN),
        "force_before_kn": float(force_smooth_kn[left_index]),
        "force_after_kn": float(force_smooth_kn[crossing_index]),
        "smoothing_window_samples": int(window_samples),
    }


# -----------------------------------------------------------------------------
# Alignment and interpolation
# -----------------------------------------------------------------------------

def choose_alignment_event(force_time_csv_s, force_unfiltered_kn, displacement_mm, timing_info, alignment_mode, static_elongation):
    if alignment_mode == "minus_2300_to_force_rise":
        displacement_event = displacement_crossing_time_after_release(
            displacement_mm,
            timing_info,
            TAUT_DISPLACEMENT_MM,
        )
        force_event = detect_force_rise_time(force_time_csv_s, force_unfiltered_kn)
    elif alignment_mode == "minus_static_to_force_rise":
        displacement_event = displacement_crossing_time_after_release(
            displacement_mm,
            timing_info,
            -1000 * (2.8 / (1 + static_elongation) - 0.3),
        )
        force_event = detect_force_rise_time(force_time_csv_s, force_unfiltered_kn)
    elif alignment_mode == "minus_2500_to_weight_force":
        displacement_event = displacement_crossing_time_after_release(
            displacement_mm,
            timing_info,
            STATIC_WEIGHT_DISPLACEMENT_MM,
        )
        force_event = detect_body_weight_force_time(force_time_csv_s, force_unfiltered_kn)
    else:
        raise ValueError(
            "alignment_mode must be 'minus_2300_to_force_rise' or "
            "'minus_2500_to_weight_force'."
        )

    release_csv_time_s = (
        force_event["event_time_csv_s"]
        - displacement_event["crossing_time_after_release_s"]
    )

    return {
        "mode": alignment_mode,
        "release_csv_time_s": float(release_csv_time_s),
        "event_time_s": displacement_event["crossing_time_after_release_s"],
        "displacement_event": displacement_event,
        "force_event": force_event,
    }


def interpolate_displacement(displacement_time_after_release_s, displacement_m, target_time_after_release_s):
    if INTERPOLATION_METHOD == "pchip":
        try:
            from scipy.interpolate import PchipInterpolator

            interpolator = PchipInterpolator(
                displacement_time_after_release_s,
                displacement_m,
                extrapolate=False,
            )
            return interpolator(target_time_after_release_s), "pchip"
        except ImportError:
            print("SciPy not installed; falling back from PCHIP to linear interpolation.")
            return np.interp(
                target_time_after_release_s,
                displacement_time_after_release_s,
                displacement_m,
                left=np.nan,
                right=np.nan,
            ), "linear fallback"
    elif INTERPOLATION_METHOD == "linear":
        return np.interp(
            target_time_after_release_s,
            displacement_time_after_release_s,
            displacement_m,
            left=np.nan,
            right=np.nan,
        ), "linear"
    else:
        raise ValueError("INTERPOLATION_METHOD must be 'pchip' or 'linear'.")


def print_processing_summary(timing_info, alignment_info, interpolation_used):
    displacement_event = alignment_info["displacement_event"]
    force_event = alignment_info["force_event"]

    print(f"Alignment mode: {alignment_info['mode']}")
    print(
        f"Displacement sample interval: {timing_info['dt_s'] * 1000:.6f} ms "
        f"({timing_info['sample_rate_hz']:.6f} Hz)"
    )
    print(
        f"Free-fall fit used {timing_info['fit_sample_count']} samples: "
        f"last included {timing_info['last_included_displacement_mm']:.0f} mm, "
        f"first excluded {timing_info['first_excluded_displacement_mm']:.0f} mm."
    )
    print(
        f"Free-fall fitted release height: {timing_info['fitted_release_height_m']:.6f} m; "
        f"RMS residual: {timing_info['rms_residual_mm']:.3f} mm; "
        f"max abs residual: {timing_info['max_abs_residual_mm']:.3f} mm."
    )
    print(
        f"Displacement event: first crossing of {displacement_event['threshold_mm']:.0f} mm "
        f"at fractional sample {displacement_event['crossing_sample_index']:.6f}, "
        f"release-based time {displacement_event['crossing_time_after_release_s']:.6f} s."
    )
    print(
        f"Force event: {force_event['event_name']} at CSV time "
        f"{force_event['event_time_csv_s']:.6f} s."
    )
    if alignment_info["mode"] == "minus_2300_to_force_rise" or alignment_info["mode"] == "minus_static_to_force_rise":
        print(
            f"Force baseline median: {force_event['baseline_median_kn']:.6f} kN; "
            f"robust sigma: {force_event['baseline_sigma_kn']:.6f} kN."
        )
        print(
            f"Force onset threshold: {force_event['onset_threshold_kn']:.6f} kN; "
            f"sustained-rise threshold: {force_event['rise_threshold_kn']:.6f} kN."
        )
    else:
        print(
            f"Target body-weight force: {force_event['target_force_kn']:.6f} kN "
            f"({1000.0 * force_event['target_force_kn']:.3f} N)."
        )
    print(
        f"CSV time determined to be mass release, mapped to returned time 0: "
        f"{alignment_info['release_csv_time_s']:.6f} s"
    )
    print(f"Displacement interpolation used: {interpolation_used}")


# -----------------------------------------------------------------------------
# Public extraction function
# -----------------------------------------------------------------------------

def read_uiaa_fall_csv(csv_file_path, alignment_mode=ALIGNMENT_MODE, verbose=True):
    """
    Read a UIAA fall CSV and return synchronized time, force, and displacement.

    Returns four lists of equal length:
        1. time_after_release_s
        2. force_filtered_kn
        3. force_unfiltered_kn
        4. displacement_m interpolated onto the force time grid

    The returned forces are exactly the CSV force columns, not smoothed. Force
    smoothing is used only internally to detect alignment events.
    """
    data = read_csv_columns(csv_file_path)
    force_time_csv_s = data["force_time_csv_s"]
    force_unfiltered_kn = data["force_unfiltered_kn"]
    force_filtered_kn = data["force_filtered_kn"]
    displacement_mm = extract_displacement_samples(data["displacement_mm_all"])

    timing_info = fit_regular_displacement_timing(displacement_mm)
    alignment_info = choose_alignment_event(
        force_time_csv_s,
        force_unfiltered_kn,
        displacement_mm,
        timing_info,
        alignment_mode,
        data["static_elongation_percent"] / 100,
    )

    release_csv_time_s = alignment_info["release_csv_time_s"]
    time_after_release_s = force_time_csv_s - release_csv_time_s

    displacement_time_after_release_s = (
        timing_info["first_displacement_time_after_release_s"]
        + np.arange(displacement_mm.size, dtype=float) * timing_info["dt_s"]
    )
    displacement_m_samples = displacement_mm / 1000.0

    displacement_m_interpolated, interpolation_used = interpolate_displacement(
        displacement_time_after_release_s,
        displacement_m_samples,
        time_after_release_s,
    )

    if verbose:
        print_processing_summary(timing_info, alignment_info, interpolation_used)

    return (
        time_after_release_s.tolist(),
        force_filtered_kn.tolist(),
        force_unfiltered_kn.tolist(),
        displacement_m_interpolated.tolist(),
        data["max_force_filtered_kn"],
        data["max_force_unfiltered_kn"],
        data["dynamic_elongation_percent"],
        data["static_elongation_percent"],
        alignment_info,
    )


# -----------------------------------------------------------------------------
# Plotting
# -----------------------------------------------------------------------------

def plot_results(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, maxf_fil_kn, maxf_unfil_kn, dyne, state, alignment, pdf_path):
    time_s = np.asarray(time_s, dtype=float)
    force_filtered_kn = np.asarray(force_filtered_kn, dtype=float)
    force_unfiltered_kn = np.asarray(force_unfiltered_kn, dtype=float)
    displacement_m = np.asarray(displacement_m, dtype=float)

    elong_zero_displ_m = ELONGATION_ZERO_DISPLACEMENT_M if alignment != 'minus_static_to_force_rise' else -(2.8 / (1 + state / 100) - 0.3)
    elongation_m = np.maximum(0.0, elong_zero_displ_m - displacement_m)

    valid_elongation = np.isfinite(elongation_m) & np.isfinite(force_unfiltered_kn)
    valid_displacement = np.isfinite(displacement_m)

    force_rise_time = detect_force_rise_time(time_s, force_unfiltered_kn)['event_time_csv_s']
    analyse_uiaa_data(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, elongation_m, elong_zero_displ_m, maxf_fil_kn, maxf_unfil_kn, dyne, state, force_rise_time)
    return

    figures = []

    fig1 = plt.figure(figsize=(9, 6))
    plt.plot(elongation_m[valid_elongation], force_unfiltered_kn[valid_elongation], linewidth=1.2)
    plt.xlabel("Rope elongation relative to -2.3 m [m]")
    plt.ylabel("Unfiltered force [kN]")
    plt.title("UIAA fall: unfiltered force vs. rope elongation")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    figures.append(fig1)

    fig2 = plt.figure(figsize=(9, 6))
    plt.plot(time_s[valid_displacement], displacement_m[valid_displacement], linewidth=1.2)
    plt.axhline(TAUT_DISPLACEMENT_M, linestyle="--", linewidth=1.0, label="-2.3 m")
    plt.axhline(STATIC_WEIGHT_DISPLACEMENT_M, linestyle=":", linewidth=1.0, label="-2.5 m")
    plt.xlabel("Time after release [s]")
    plt.ylabel("Interpolated displacement [m]")
    plt.title("UIAA fall: displacement vs. time")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    figures.append(fig2)

    fig3 = plt.figure(figsize=(9, 6))
    plt.plot(time_s, force_unfiltered_kn, linewidth=0.9, label="Unfiltered force")
    plt.plot(time_s, force_filtered_kn, linewidth=1.2, label="Filtered force")
    plt.axhline(BODY_WEIGHT_FORCE_KN, linestyle=":", linewidth=1.0, label="80 kg * g")
    plt.xlabel("Time after release [s]")
    plt.ylabel("Force [kN]")
    plt.title("UIAA fall: force vs. time")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    figures.append(fig3)

    with PdfPages(pdf_path) as pdf:
        for fig in figures:
            pdf.savefig(fig)

    print(f"Saved {pdf_path}")
    plt.show()


# -----------------------------------------------------------------------------
# Main script
# -----------------------------------------------------------------------------

def main():
    time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, maxf_fil_kn, maxf_unfil_kn, dyne, state, alignment_info = read_uiaa_fall_csv(
        CSV_PATH,
        alignment_mode=ALIGNMENT_MODE,
        verbose=True,
    )
    plot_results(time_s, force_filtered_kn, force_unfiltered_kn, displacement_m, maxf_fil_kn, maxf_unfil_kn, dyne, state, ALIGNMENT_MODE, PDF_PATH)


if __name__ == "__main__":
    main()
