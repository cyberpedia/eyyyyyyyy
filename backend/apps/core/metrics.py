from __future__ import annotations

from prometheus_client import Counter

# Submission counters
flag_submissions_total = Counter(
    "ctf_flag_submissions_total",
    "Total flag submissions",
    labelnames=("correct",),
)

# Attack-Defense counters
ad_defense_uptime_ticks_total = Counter(
    "ctf_ad_defense_uptime_ticks_total",
    "Total defense uptime ticks awarded",
)
ad_attack_success_total = Counter(
    "ctf_ad_attack_success_total",
    "Total successful attack events",
)

# KotH counters
koth_hold_ticks_total = Counter(
    "ctf_koth_hold_ticks_total",
    "Total KotH hold ticks awarded",
)