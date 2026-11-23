"""Run: python3 -m unittest discover -s tests (standard library only; urls.py is loaded by path so Home Assistant is not needed)."""

import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    "doshy_urls", pathlib.Path(__file__).parents[1] / "custom_components" / "doshy" / "urls.py"
)
urls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(urls)


class NormalizeUrl(unittest.TestCase):
    def test_keeps_a_full_address(self):
        self.assertEqual(urls.normalize_url("https://doshy.example.com:8443"), "https://doshy.example.com:8443")

    def test_adds_http_and_trims(self):
        self.assertEqual(urls.normalize_url("  homeassistant.local:3000/ "), "http://homeassistant.local:3000")

    def test_drops_query_and_fragment_keeps_path(self):
        self.assertEqual(urls.normalize_url("http://10.0.0.5:3000/doshy/?a=1#x"), "http://10.0.0.5:3000/doshy")

    def test_rejects_bad_addresses(self):
        for bad in ("", "ftp://host", "http://", "http://host:99999", "http://host:abc", "http://user:pw@host:3000"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                urls.normalize_url(bad)


if __name__ == "__main__":
    unittest.main()
