"""Address handling for the Doshy config flow. No Home Assistant imports, so tests can load it on its own."""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def normalize_url(value: str) -> str:
    """Return ``scheme://host[:port][/path]`` for what the user typed, or raise ValueError.

    A missing scheme means http. Query, fragment and a trailing slash are dropped;
    an address with a login in it is refused because the sidebar passes it on to every browser.
    """
    text = value.strip()
    if "://" not in text:
        text = f"http://{text}"
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
        raise ValueError(value)
    _ = parts.port  # raises ValueError for a port that is not a number from 0 to 65535
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))
