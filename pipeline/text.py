"""Tokenising, numbers and units. Deliberately small: every rule here is one a reader can check by eye."""
from __future__ import annotations

import re
import unicodedata

_TOKEN = re.compile(r"\d+(?:\.\d+)?|[a-z]+")
_INCH_MARK = re.compile(r"(\d)\s*(?:\"|”|″|'')")

# Surface form -> canonical unit. Only applied to a token that directly follows a number.
UNITS = {
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
    "g": "g", "gram": "g", "grams": "g", "kg": "kg",
    "ml": "ml", "l": "l", "liter": "l", "liters": "l", "litre": "l",
    "qt": "qt", "quart": "qt", "quarts": "qt", "gal": "gal", "gallon": "gal", "gallons": "gal",
    "in": "in", "inch": "in", "inches": "in",
    "ft": "ft", "foot": "ft", "feet": "ft", "yd": "yd", "yard": "yd", "yards": "yd",
    "mm": "mm", "cm": "cm", "m": "m", "meter": "m", "meters": "m",
    "pack": "pack", "packs": "pack", "pk": "pack",
    "count": "ct", "ct": "ct", "pc": "pc", "pcs": "pc", "piece": "pc", "pieces": "pc",
    "gb": "gb", "tb": "tb", "mb": "mb", "mah": "mah",
    "w": "w", "watt": "w", "watts": "w", "v": "v", "volt": "v", "volts": "v", "amp": "amp", "amps": "amp",
    "qt.": "qt", "x": "x",  # "2x", "10x"
    "gen": "gen", "t": "t",  # "4t" toddler sizes
}


def normalise(text: str | None) -> str:
    if not isinstance(text, str) or not text:  # missing brand/colour arrives as NaN
        return ""
    text = unicodedata.normalize("NFKC", text).lower()
    return _INCH_MARK.sub(r"\1 in ", text)


def stem(token: str) -> str:
    """Strip a plural 's'. Nothing cleverer: 'glasses' -> 'glasse', and that is fine as long as both sides agree."""
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _canonical_number(token: str) -> str:
    if "." in token:
        token = token.rstrip("0").rstrip(".")
    return token.lstrip("0") or "0"


def tokens(text: str | None) -> list[str]:
    """Lower-case word and number tokens. '16oz' -> ['16', 'oz']; 'WH-1000XM4' -> ['wh', '1000', 'xm', '4']."""
    out = []
    for tok in _TOKEN.findall(normalise(text)):
        out.append(_canonical_number(tok) if tok[0].isdigit() else stem(tok))
    return out


def numbers(toks: list[str]) -> set[str]:
    return {t for t in toks if t[0].isdigit()}


def measures(toks: list[str]) -> set[tuple[str, str]]:
    """(number, unit) pairs: a number directly followed by a known unit word."""
    out = set()
    for a, b in zip(toks, toks[1:]):
        if a[0].isdigit() and b in _STEMMED_UNITS:
            out.add((a, _STEMMED_UNITS[b]))
    return out


_STEMMED_UNITS = {stem(k): v for k, v in UNITS.items() if k.isalpha()}
