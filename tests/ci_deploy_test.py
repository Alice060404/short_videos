import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location(
    "server_deploy", Path(__file__).parents[1] / "deploy/ci/server-deploy.py"
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def make_tar(path: Path, entries: list[tuple[str, bytes | str]]) -> None:
    with tarfile.open(path, "w:gz") as tf:
        for name, content in entries:
            if isinstance(content, str) and content.startswith("SYMLINK:"):
                info = tarfile.TarInfo(name)
                info.type = tarfile.SYMTYPE
                info.linkname = content.split(":", 1)[1]
                tf.addfile(info)
            else:
                raw = content if isinstance(content, bytes) else content.encode("utf-8")
                info = tarfile.TarInfo(name)
                info.size = len(raw)
                tf.addfile(info, io.BytesIO(raw))


class CiDeployTests(unittest.TestCase):
    def test_validate_manifest_accepts_valid_payloads(self):
        m = deploy.validate_manifest({
            "release_id": "20261121-101500-a1b2c3d4",
            "commit_sha": "a1b2c3d4e5f60718",
            "deploy_site": True,
            "deploy_youtube": False,
        })
        self.assertEqual(m["release_id"], "20261121-101500-a1b2c3d4")
        self.assertTrue(m["deploy_site"])
        self.assertFalse(m["deploy_youtube"])

    def test_validate_manifest_rejects_bad_inputs(self):
        bad_cases = [
            "not-a-dict",
            {"release_id": "../evil", "deploy_site": True, "deploy_youtube": False},
            {"release_id": "20261121-101500-a1b2c3d4", "deploy_site": False, "deploy_youtube": False},
            {"release_id": "20261121-101500-a1b2c3d4", "deploy_site": "yes", "deploy_youtube": False},
            {"release_id": "20261121-101500-a1b2c3d4", "commit_sha": "bad;cmd", "deploy_site": True, "deploy_youtube": False},
        ]
        for case in bad_cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                deploy.validate_manifest(case)

    def test_safe_extract_tar_accepts_normal_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            arc = Path(tmp) / "ok.tar.gz"
            dest = Path(tmp) / "out"
            make_tar(arc, [("./frontend/index.html", b"<html>ok</html>"), ("api/sv.php", b"<?php")])
            size = deploy.safe_extract_tar(arc, dest)
            self.assertGreater(size, 0)
            self.assertEqual((dest / "frontend/index.html").read_bytes(), b"<html>ok</html>")
            self.assertEqual((dest / "api/sv.php").read_bytes(), b"<?php")

    def test_safe_extract_tar_rejects_traversal_absolute_symlink_and_oversize(self):
        with tempfile.TemporaryDirectory() as tmp:
            for label, entries in [
                ("traversal", [("../escape.txt", b"x")]),
                ("nested-traversal", [("a/../../escape.txt", b"x")]),
                ("absolute", [("/etc/passwd", b"x")]),
                ("symlink", [("link", "SYMLINK:/etc/shadow")]),
            ]:
                with self.subTest(label=label):
                    arc = Path(tmp) / f"{label}.tar.gz"
                    make_tar(arc, entries)
                    with self.assertRaises(ValueError):
                        deploy.safe_extract_tar(arc, Path(tmp) / f"out-{label}")

            big_arc = Path(tmp) / "big.tar.gz"
            make_tar(big_arc, [("big.bin", b"a" * 2048)])
            with self.assertRaises(ValueError):
                deploy.safe_extract_tar(big_arc, Path(tmp) / "out-big", max_bytes=1024)

    def test_write_svproxy_stub(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = Path(tmp)
            deploy.write_svproxy_stub(api)
            content = (api / "svproxyurl.php").read_text(encoding="utf-8")
            self.assertIn("https://media.litcheng.com/", content)
            self.assertIn("307", content)

    def test_prune_releases_keeps_active_and_newest(self):
        with tempfile.TemporaryDirectory() as tmp:
            rel = Path(tmp) / "releases"
            rel.mkdir()
            names = ["r1", "r2", "r3", "r4", "r5", "r6"]
            now = time.time() - 100
            for idx, name in enumerate(names):
                d = rel / name
                d.mkdir()
                os.utime(d, (now + idx, now + idx))
            # Make r1 active even though it is the oldest; it must NOT be deleted.
            removed = deploy.prune_releases(rel, rel / "r1", keep=3)
            remaining = sorted(p.name for p in rel.iterdir())
            self.assertEqual(remaining, ["r1", "r5", "r6"])
            self.assertEqual(sorted(removed), ["r2", "r3", "r4"])


if __name__ == "__main__":
    unittest.main()
