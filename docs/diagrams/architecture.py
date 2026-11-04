# /// script
# requires-python = ">=3.12"
# dependencies = ["matplotlib>=3.9"]
# ///
"""Render the solver architecture flowchart: uv run docs/diagrams/architecture.py"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

# Ramp stops: (fill, stroke, title, subtitle)
GRAY = ("#F1EFE8", "#888780", "#2C2C2A", "#5F5E5A")
TEAL = ("#E1F5EE", "#0F6E56", "#04342C", "#0F6E56")
PURPLE = ("#EEEDFE", "#534AB7", "#26215C", "#534AB7")
CORAL = ("#FAECE7", "#993C1D", "#4A1B0C", "#993C1D")
BLUE = ("#E6F1FB", "#185FA5", "#042C53", "#185FA5")
# Drawn straight onto the slide background (#2433A5), so everything off-box is light
INK, MUTED, LINE, FRAME = "#FFFFFF", "#CDD2F5", "#E6E9FC", "#9AA3E6"

plt.rcParams["font.family"] = ["Segoe UI", "DejaVu Sans"]

fig, ax = plt.subplots(figsize=(16, 10), dpi=200)
ax.set_xlim(0, 160)
ax.set_ylim(0, 100)
ax.set_aspect("equal")
ax.axis("off")
fig.patch.set_alpha(0)
fig.subplots_adjust(0, 0, 1, 1)


def box(cx, cy, w, h, title, sub="", ramp=GRAY, size=10.5):
    ax.add_patch(
        FancyBboxPatch(
            (cx - w / 2, cy - h / 2),
            w,
            h,
            boxstyle="round,pad=0,rounding_size=1.2",
            facecolor=ramp[0],
            edgecolor=ramp[1],
            linewidth=1.2,
            zorder=2,
        )
    )
    if sub:
        ax.text(
            cx,
            cy + h * 0.17,
            title,
            ha="center",
            va="center",
            fontsize=size,
            fontweight="semibold",
            color=ramp[2],
            zorder=3,
        )
        ax.text(
            cx,
            cy - h * 0.2,
            sub,
            ha="center",
            va="center",
            fontsize=size - 2.2,
            color=ramp[3],
            zorder=3,
            linespacing=1.35,
        )
    else:
        ax.text(
            cx,
            cy,
            title,
            ha="center",
            va="center",
            fontsize=size,
            fontweight="semibold",
            color=ramp[2],
            zorder=3,
        )
    return {"cx": cx, "cy": cy, "w": w, "h": h}


def arrow(
    a,
    b,
    label="",
    dashed=False,
    color=LINE,
    start="bottom",
    end="top",
    rad=0.0,
    label_dx=1.0,
):
    def anchor(n, side):
        return {
            "top": (n["cx"], n["cy"] + n["h"] / 2),
            "bottom": (n["cx"], n["cy"] - n["h"] / 2),
            "left": (n["cx"] - n["w"] / 2, n["cy"]),
            "right": (n["cx"] + n["w"] / 2, n["cy"]),
        }[side]

    p, q = anchor(a, start), anchor(b, end)
    ax.add_patch(
        FancyArrowPatch(
            p,
            q,
            arrowstyle="-|>,head_length=5,head_width=3",
            connectionstyle=f"arc3,rad={rad}",
            color=color,
            linewidth=1.1,
            linestyle=(0, (4, 3)) if dashed else "-",
            zorder=1,
            shrinkA=1,
            shrinkB=1,
        )
    )
    if label:
        ax.text(
            (p[0] + q[0]) / 2 + label_dx,
            (p[1] + q[1]) / 2,
            label,
            fontsize=8,
            color=MUTED,
            ha="left",
            va="center",
        )


def region(x, y, w, h, label):
    ax.add_patch(
        FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0,rounding_size=2",
            facecolor="none",
            edgecolor=FRAME,
            linewidth=1,
            linestyle=(0, (5, 4)),
            zorder=0,
        )
    )
    ax.text(
        x + 2,
        y + h - 2.5,
        label,
        fontsize=11,
        fontweight="semibold",
        color=INK,
        va="center",
    )


# Build time: one schema, generated bindings
region(2, 2, 40, 96, "Build time · one schema")
schema = box(23, 84, 32, 9, "fbs/*.fbs", "FlatBuffers schemas\ntypes · solve · info")
codegen = box(
    23, 68, 32, 9, "scripts/codegen", "parse once into a\nlanguage-neutral IR"
)
ts_gen = box(
    24.5,
    50,
    29,
    9,
    "TypeScript target",
    "FlatBuffers classes + translation\nnode/src/gen",
    TEAL,
)
cpp_gen = box(
    24.5, 36, 29, 9, "C++ target", "FlatBuffers + fbs::domain structs\nsrc/gen", BLUE
)
php_gen = box(
    24.5,
    22,
    29,
    9,
    "PHP target",
    "zval ↔ fbs::domain bridge (C++)\nsrc/php/gen",
    PURPLE,
)
arrow(schema, codegen)
# One trunk out of codegen, one branch per language target
SPINE = 6.5
ax.plot(
    [23, 23, SPINE, SPINE],
    [63.5, 58, 58, 22],
    color=LINE,
    linewidth=1.1,
    zorder=1,
    solid_capstyle="round",
)
for target in (ts_gen, cpp_gen, php_gen):
    ax.add_patch(
        FancyArrowPatch(
            (SPINE, target["cy"]),
            (target["cx"] - target["w"] / 2, target["cy"]),
            arrowstyle="-|>,head_length=5,head_width=3",
            color=LINE,
            linewidth=1.1,
            zorder=1,
            shrinkA=0,
            shrinkB=1,
        )
    )
ax.text(
    22,
    10,
    "New language = one targets/<lang>.mjs\nparser and schema analysis unchanged\n\nColours match the runtime layer that uses each target",
    ha="center",
    va="center",
    fontsize=8.5,
    color=MUTED,
    linespacing=1.4,
)

# Runtime: three languages into one engine
region(46, 2, 112, 96, "Runtime · three languages, one engine")
L1, L2, L3 = 68, 102, 136
node_app = box(
    L1, 86, 30, 8, "Node.js / TypeScript", "await solve({ boxes, items })", TEAL
)

php_app = box(L2, 86, 30, 8, "PHP", "bionic_solver solve(...)", PURPLE)

cpp_app = box(L3, 86, 30, 8, "C++", "solver CLI · direct call", CORAL)

node_addon = box(
    L1,
    66.4,
    30,
    11,
    "@bionic/solver wrapper",
    "N-API addon (addon.node) using FlatBuffers",
    TEAL,
)

php_ext = box(
    L2,
    66.5,
    30,
    11,
    "PHP extension",
    "bionic_solver .so / .dll\narrays → fbs::domain directly\nno FlatBuffers at runtime",
    PURPLE,
)

cpp_link = box(
    L3,
    66.5,
    30,
    11,
    "Static link",
    "links solver_core\nbuilds fbs::domain::\nSolveRequest itself",
    CORAL,
)

core = box(
    L2,
    44,
    98,
    9,
    "solver_core",
    "Translates incoming fbs types to internal domain types\nand routes to the selected algorithm",
    BLUE,
    size=11.5,
)

arrow(node_app, node_addon)
arrow(node_addon, core, end="top")
arrow(php_app, php_ext)
arrow(php_ext, core)
arrow(cpp_app, cpp_link)
arrow(cpp_link, core, end="top")

auto = box(
    80,
    28,
    42,
    9,
    "SolveAlgorithm.Auto (default)",
    "≥ 1,000 instances or unsupported features\n→ ExtremePoint, otherwise → Guillotine",
    BLUE,
)
registry = box(
    130,
    28,
    40,
    9,
    "Algorithm registry",
    "each solver self-registers\nget_algo(SolveAlgorithm)",
    BLUE,
)
arrow(core, auto, start="bottom", end="top")
arrow(auto, registry, start="right", end="left")
ax.text(105.5, 29.6, "resolved", fontsize=8, color=MUTED, ha="center", va="bottom")
ax.text(
    124, 37.2, "explicit algorithm", fontsize=8, color=MUTED, ha="left", va="center"
)
ax.add_patch(
    FancyArrowPatch(
        (122, 39.5),
        (126, 32.5),
        arrowstyle="-|>,head_length=5,head_width=3",
        color=LINE,
        linewidth=1.1,
        zorder=1,
    )
)

algos = [
    ("ExtremePoint", "extreme-point heuristic\nlarge orders"),
    ("Guillotine", "guillotine cuts\nsmall orders, fewer boxes"),
    ("PHPSolver", "port of the original\nPHP packer"),
    ("StackBased", "simple single-box\nstacking"),
]
for i, (name, sub) in enumerate(algos):
    a = box(64 + i * 25, 11, 22, 9, name, sub, BLUE, size=10)
    arrow(registry, a, start="bottom", end="top")

# Return path
ax.add_patch(
    FancyArrowPatch(
        (155, 11),
        (155, 86),
        arrowstyle="-|>,head_length=5,head_width=3",
        connectionstyle="arc3,rad=0",
        color=MUTED,
        linewidth=1,
        linestyle=(0, (4, 3)),
        zorder=1,
    )
)
ax.text(
    156.3,
    48,
    "SolveResponse returns the same way\n(FlatBuffers · zval · struct)",
    rotation=90,
    fontsize=8,
    color=MUTED,
    ha="left",
    va="center",
    linespacing=1.4,
)

ax.text(
    155,
    95.5,
    "Prebuilt for win32-x64 · linux-x64 · darwin-arm64",
    fontsize=8,
    color=MUTED,
    ha="right",
    va="center",
)

out = Path(__file__).with_name("architecture.png")
fig.savefig(out, dpi=200, transparent=False)
print(f"wrote {out}")
