import ast
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DeploymentTests(unittest.TestCase):
    def test_nginx_permits_only_known_php_entries(self):
        tree = ast.parse((ROOT / "deploy/security/make-nginx.py").read_text(encoding="utf-8"))
        server = next(n.value for n in ast.walk(tree) if isinstance(n, ast.Constant)
                      and isinstance(n.value, str) and n.value.startswith("server {"))
        pattern = re.search(r"location ~ (\^/api/\(.+?\)\\.php\$)", server)[1]
        for path in ("youtube/youtube", "x/x", "douyin/douyin", "weibo", "bilibili/bilibili"):
            self.assertIsNotNone(re.fullmatch(pattern, "/api/" + path + ".php"))
        for path in ("/api/youtube/other.php", "/api/x/other.php", "/api/sv.php", "/api/youtube/youtube.php/extra"):
            self.assertIsNone(re.fullmatch(pattern, path))
        self.assertIn("location ~ ^/api/ { return 404; }", server)

    def test_local_exception_is_narrow_and_before_deny(self):
        rules = (ROOT / "deploy/security/parser-egress.sh").read_text()
        allow = "-p tcp -d 127.0.0.1 --dport 8765 -j ACCEPT"
        self.assertIn(allow, rules)
        self.assertLess(rules.index(allow), rules.index("for cidr"))
        self.assertIn("127.0.0.0/8", rules)
        self.assertIn('id -u svparser', rules)

    def test_worker_has_independent_limits_and_network_rules(self):
        unit = (ROOT / "deploy/youtube/short-videos-youtube.service").read_text()
        for setting in ("User=svyoutube", "KillMode=control-group", "MemoryMax=512M", "CPUQuota=100%",
                        "NoNewPrivileges=yes", "ProtectSystem=strict", "TasksMax=64"):
            self.assertIn(setting, unit)
        rules = (ROOT / "deploy/youtube/egress.sh").read_text()
        self.assertIn("id -u svyoutube", rules)
        self.assertLess(rules.index("ESTABLISHED,RELATED"), rules.index("for cidr"))
        self.assertIn("169.254.0.0/16", rules)
        self.assertIn("SV_YOUTUBE_EGRESS -j REJECT", rules)


if __name__ == "__main__":
    unittest.main()
