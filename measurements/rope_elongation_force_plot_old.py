from pathlib import Path
import csv
import math
import numpy as np
import matplotlib.pyplot as plt

# -----------------------------------------------------------------------------
# User settings
# -----------------------------------------------------------------------------

CSV_PATH = Path("1_Report_EN892_Einfachseil_d9,2mm.csv")
PNG_PATH = Path("rope_elongation_vs_unfiltered_force.png")
PDF_PATH = Path("rope_elongation_vs_unfiltered_force.pdf")

# Choose one of:
#   "force_taut"        Detect when the force starts to rise, then align that
#                        time with the instant where displacement reaches -2.3 m.
#   "release_time_zero" Assume CSV time zero is the release time. Fit the
#                        displacement sample times to free fall from +2.3 m at t=0.
ALIGNMENT_MODE = "force_taut"

G = 9.80665
START_HEIGHT_M = 2.3
ELONGATION_THRESHOLD_MM = -2300.0

# Force-rise detection settings for ALIGNMENT_MODE = "force_taut".
# These defaults work for the attached UIAA norm-fall CSV. They are intentionally
# near the top of the file so you can adjust them if a different recording is used.
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
# Helpers
# -----------------------------------------------------------------------------

def parse_decimal(value):
    value = value.strip()
    if not value:
        return np.nan
    return float(value.replace(",", "."))


def read_csv(csv_path):
    rows = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        header = next(reader)
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
        raise ValueError(f"No numeric rows found in {csv_path}")

    data = np.asarray(rows, dtype=float)
    return {
        "time_s": data[:, 0],
        "force_unfiltered_kn": data[:, 1],
        "force_filtered_kn": data[:, 2],
        "displacement_mm_all": data[:, 3],
    }


def moving_average(y, window_samples):
    window_samples = int(max(1, window_samples))
    kernel = np.ones(window_samples, dtype=float) / window_samples
    return np.convolve(y, kernel, mode="same")


def robust_sigma(y):
    med = np.nanmedian(y)
    mad = np.nanmedian(np.abs(y - med))
    return 1.4826 * mad


def extract_displacement_samples(displacement_mm_all):
    # In this CSV, the displacement channel is populated at the beginning and is
    # zero-filled afterwards. Keep all samples up to the last nonzero value.
    valid_disp_idx = np.flatnonzero(displacement_mm_all != 0)
    if valid_disp_idx.size == 0:
        raise ValueError("No nonzero displacement samples found.")
    last_valid_disp_idx = int(valid_disp_idx[-1])
    return displacement_mm_all[: last_valid_disp_idx + 1]


def first_threshold_crossing_index(y, threshold):
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
    return i0 + frac, i1


def fit_regular_sample_interval_quadratic(displacement_mm, threshold_mm):
    # Fit only the free-fall part down to the elongation threshold, excluding the
    # first sample already below the threshold.
    _, first_below = first_threshold_crossing_index(displacement_mm, threshold_mm)
    fit_displacement_mm = displacement_mm[:first_below]

    sample_index = np.arange(fit_displacement_mm.size, dtype=float)
    h_m = fit_displacement_mm / 1000.0

    # Regular-sampling free-fall fit:
    # h_n = A + B*n + C*n^2 = H - 0.5*G*(t0 + n*dt)^2.
    # Therefore C = -0.5*G*dt^2.
    X = np.column_stack([np.ones_like(sample_index), sample_index, sample_index**2])
    A, B, C = np.linalg.lstsq(X, h_m, rcond=None)[0]
    if C >= 0:
        raise ValueError("Quadratic fit did not produce a free-fall curvature.")

    dt_s = math.sqrt(-2.0 * C / G)
    t0_freefall_s = -B / (G * dt_s)
    fitted_start_height_m = A + 0.5 * G * t0_freefall_s**2
    residual_mm = (h_m - (A + B * sample_index + C * sample_index**2)) * 1000.0

    return {
        "dt_s": dt_s,
        "sample_rate_hz": 1.0 / dt_s,
        "first_below_index": first_below,
        "fit_sample_count": fit_displacement_mm.size,
        "last_included_displacement_mm": fit_displacement_mm[-1],
        "first_excluded_displacement_mm": displacement_mm[first_below],
        "fitted_start_height_m": fitted_start_height_m,
        "rms_residual_mm": float(np.sqrt(np.mean(residual_mm**2))),
        "max_abs_residual_mm": float(np.max(np.abs(residual_mm))),
    }


def fit_release_time_zero(displacement_mm, threshold_mm):
    # Fit t_n = t_first + n*dt by inverting the free-fall equation
    # h(t) = START_HEIGHT_M - 0.5*G*t^2, with t=0 fixed at release.
    _, first_below = first_threshold_crossing_index(displacement_mm, threshold_mm)
    fit_displacement_mm = displacement_mm[:first_below]

    sample_index = np.arange(fit_displacement_mm.size, dtype=float)
    h_m = fit_displacement_mm / 1000.0
    fall_distance_m = START_HEIGHT_M - h_m
    if np.any(fall_distance_m < 0):
        raise ValueError(
            "Some displacement samples are above START_HEIGHT_M, so the release-time-zero "
            "fit cannot invert the free-fall equation."
        )

    inferred_time_s = np.sqrt(2.0 * fall_distance_m / G)
    X = np.column_stack([np.ones_like(sample_index), sample_index])
    t_first_s, dt_s = np.linalg.lstsq(X, inferred_time_s, rcond=None)[0]
    fitted_time_s = t_first_s + sample_index * dt_s
    residual_ms = (inferred_time_s - fitted_time_s) * 1000.0

    return {
        "dt_s": float(dt_s),
        "sample_rate_hz": float(1.0 / dt_s),
        "first_displacement_time_s": float(t_first_s),
        "first_below_index": first_below,
        "fit_sample_count": fit_displacement_mm.size,
        "last_included_displacement_mm": fit_displacement_mm[-1],
        "first_excluded_displacement_mm": displacement_mm[first_below],
        "rms_time_residual_ms": float(np.sqrt(np.mean(residual_ms**2))),
        "max_abs_time_residual_ms": float(np.max(np.abs(residual_ms))),
    }


def detect_force_rise_time(force_time_s, force_unfiltered_kn):
    dt_force_s = float(np.nanmedian(np.diff(force_time_s)))
    window_samples = max(1, int(round(FORCE_SMOOTHING_WINDOW_S / dt_force_s)))
    hold_samples = max(1, int(round(FORCE_RISE_HOLD_DURATION_S / dt_force_s)))
    force_smooth_kn = moving_average(force_unfiltered_kn, window_samples)

    baseline_mask = force_time_s <= FORCE_BASELINE_END_S
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
        (force_time_s >= FORCE_RISE_SEARCH_START_S)
        & (force_time_s <= FORCE_RISE_SEARCH_END_S)
    )
    if search_indices.size == 0:
        raise ValueError("No force samples in the force-rise search interval.")

    crossing_index = None
    for i in search_indices:
        if i + hold_samples > force_smooth_kn.size:
            break
        if np.all(force_smooth_kn[i : i + hold_samples] > rise_threshold_kn):
            crossing_index = int(i)
            break

    if crossing_index is None:
        raise ValueError(
            "Could not detect a sustained force rise. Try lowering FORCE_RISE_MIN_THRESHOLD_KN "
            "or widening FORCE_RISE_SEARCH_START_S / FORCE_RISE_SEARCH_END_S."
        )

    # The sustained threshold crossing is deliberately conservative. Backtrack to
    # a lower onset threshold to estimate when the force actually starts rising.
    onset_index = crossing_index
    while onset_index > 0 and force_smooth_kn[onset_index] > onset_threshold_kn:
        onset_index -= 1
    onset_index += 1

    return {
        "taut_time_s": float(force_time_s[onset_index]),
        "sustained_crossing_time_s": float(force_time_s[crossing_index]),
        "onset_index": onset_index,
        "crossing_index": crossing_index,
        "smoothed_force_at_onset_kn": float(force_smooth_kn[onset_index]),
        "smoothed_force_at_crossing_kn": float(force_smooth_kn[crossing_index]),
        "baseline_median_kn": baseline_median_kn,
        "baseline_sigma_kn": baseline_sigma_kn,
        "rise_threshold_kn": float(rise_threshold_kn),
        "onset_threshold_kn": float(onset_threshold_kn),
        "smoothing_window_samples": window_samples,
        "hold_samples": hold_samples,
    }


def build_displacement_time(force_time_s, force_unfiltered_kn, displacement_mm):
    crossing_sample_index, _ = first_threshold_crossing_index(
        displacement_mm,
        ELONGATION_THRESHOLD_MM,
    )

    quadratic_fit = fit_regular_sample_interval_quadratic(
        displacement_mm,
        ELONGATION_THRESHOLD_MM,
    )
    release_fit = fit_release_time_zero(
        displacement_mm,
        ELONGATION_THRESHOLD_MM,
    )

    if ALIGNMENT_MODE == "force_taut":
        force_rise = detect_force_rise_time(force_time_s, force_unfiltered_kn)
        dt_s = quadratic_fit["dt_s"]
        displacement_time_s = (
            force_rise["taut_time_s"]
            + (np.arange(displacement_mm.size, dtype=float) - crossing_sample_index) * dt_s
        )
        alignment_info = {
            "mode": ALIGNMENT_MODE,
            "dt_s": dt_s,
            "sample_rate_hz": 1.0 / dt_s,
            "threshold_crossing_sample_index": crossing_sample_index,
            "threshold_crossing_time_s": force_rise["taut_time_s"],
            "force_rise": force_rise,
            "quadratic_fit": quadratic_fit,
            "release_time_zero_check": release_fit,
        }
    elif ALIGNMENT_MODE == "release_time_zero":
        dt_s = release_fit["dt_s"]
        displacement_time_s = release_fit["first_displacement_time_s"] + np.arange(
            displacement_mm.size,
            dtype=float,
        ) * dt_s
        threshold_crossing_time_s = release_fit["first_displacement_time_s"] + crossing_sample_index * dt_s

        # Still compute the force-rise time for comparison, but do not use it for alignment.
        force_rise = detect_force_rise_time(force_time_s, force_unfiltered_kn)
        alignment_info = {
            "mode": ALIGNMENT_MODE,
            "dt_s": dt_s,
            "sample_rate_hz": 1.0 / dt_s,
            "threshold_crossing_sample_index": crossing_sample_index,
            "threshold_crossing_time_s": float(threshold_crossing_time_s),
            "force_rise_check": force_rise,
            "release_fit": release_fit,
            "quadratic_fit_check": quadratic_fit,
        }
    else:
        raise ValueError(
            "ALIGNMENT_MODE must be either 'force_taut' or 'release_time_zero'."
        )

    return displacement_time_s, alignment_info


def print_alignment_summary(info):
    print(f"Alignment mode: {info['mode']}")
    print(
        f"Displacement sample interval used: {info['dt_s'] * 1000:.6f} ms "
        f"({info['sample_rate_hz']:.6f} Hz)"
    )
    print(
        f"Displacement reaches {ELONGATION_THRESHOLD_MM:.0f} mm at fractional sample "
        f"{info['threshold_crossing_sample_index']:.6f}."
    )
    print(
        f"Assigned time for displacement = {ELONGATION_THRESHOLD_MM:.0f} mm: "
        f"{info['threshold_crossing_time_s']:.6f} s"
    )

    if info["mode"] == "force_taut":
        fr = info["force_rise"]
        q = info["quadratic_fit"]
        r = info["release_time_zero_check"]
        print(
            f"Detected taut-rope force onset: {fr['taut_time_s']:.6f} s "
            f"(sustained threshold crossing at {fr['sustained_crossing_time_s']:.6f} s)."
        )
        print(
            f"Force baseline median: {fr['baseline_median_kn']:.6f} kN; "
            f"robust sigma: {fr['baseline_sigma_kn']:.6f} kN."
        )
        print(
            f"Force onset threshold: {fr['onset_threshold_kn']:.6f} kN; "
            f"sustained-rise threshold: {fr['rise_threshold_kn']:.6f} kN."
        )
        print(
            f"Free-fall quadratic fit used {q['fit_sample_count']} samples: "
            f"last included {q['last_included_displacement_mm']:.0f} mm, "
            f"first excluded {q['first_excluded_displacement_mm']:.0f} mm."
        )
        print(
            f"Quadratic fit residual: RMS {q['rms_residual_mm']:.3f} mm, "
            f"max abs {q['max_abs_residual_mm']:.3f} mm."
        )
        print(
            f"Release-time-zero check would use dt = {r['dt_s'] * 1000:.6f} ms."
        )
    else:
        r = info["release_fit"]
        q = info["quadratic_fit_check"]
        fr = info["force_rise_check"]
        print(
            f"Release-time-zero fit used {r['fit_sample_count']} samples: "
            f"last included {r['last_included_displacement_mm']:.0f} mm, "
            f"first excluded {r['first_excluded_displacement_mm']:.0f} mm."
        )
        print(f"Inferred first displacement sample time: {r['first_displacement_time_s']:.6f} s")
        print(
            f"Release-time-zero fit residual: RMS {r['rms_time_residual_ms']:.3f} ms, "
            f"max abs {r['max_abs_time_residual_ms']:.3f} ms."
        )
        print(
            f"Detected force-rise onset, not used for this alignment: {fr['taut_time_s']:.6f} s."
        )
        print(
            f"Force-rise onset minus displacement-threshold time: "
            f"{fr['taut_time_s'] - info['threshold_crossing_time_s']:.6f} s."
        )
        print(
            f"Quadratic regular-sampling check would use dt = {q['dt_s'] * 1000:.6f} ms."
        )


# -----------------------------------------------------------------------------
# Main script
# -----------------------------------------------------------------------------

def main():
    data = read_csv(CSV_PATH)
    force_time_s = data["time_s"]
    force_unfiltered_kn = data["force_unfiltered_kn"]
    displacement_mm = extract_displacement_samples(data["displacement_mm_all"])

    displacement_time_s, alignment_info = build_displacement_time(
        force_time_s,
        force_unfiltered_kn,
        displacement_mm,
    )

    # displacement above -2300 mm => 0; displacement below -2300 mm => -2300 - displacement
    elongation_mm_samples = np.maximum(0.0, ELONGATION_THRESHOLD_MM - displacement_mm)
    elongation_mm = np.interp(
        force_time_s,
        displacement_time_s,
        elongation_mm_samples,
        left=np.nan,
        right=np.nan,
    )

    mask = np.isfinite(elongation_mm) & np.isfinite(force_unfiltered_kn)

    plt.figure(figsize=(9, 6))
    plt.plot(elongation_mm[mask], force_unfiltered_kn[mask], linewidth=1.2)
    plt.xlabel("Rope elongation from displacement channel [mm]")
    plt.ylabel("Unfiltered force [kN]")
    plt.title(
        "UIAA fall: unfiltered force vs. rope elongation\n"
        f"alignment = {ALIGNMENT_MODE}, "
        f"displacement interval ≈ {alignment_info['dt_s'] * 1000:.3f} ms"
    )
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(PNG_PATH, dpi=200)
    plt.savefig(PDF_PATH)

    print_alignment_summary(alignment_info)
    print(f"Max interpolated elongation on force time grid: {np.nanmax(elongation_mm):.3f} mm")
    print(f"Saved {PNG_PATH} and {PDF_PATH}")


if __name__ == "__main__":
    main()
