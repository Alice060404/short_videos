import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("youtube_service", Path(__file__).parents[1] / "services/youtube/service.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class YoutubeTests(unittest.TestCase):
    def test_canonical_links(self):
        target = "https://www.youtube.com/watch?v=BaW_jenozKc"
        for source in [target + "&list=ignored", "https://youtu.be/BaW_jenozKc?t=1",
                       "分享 https://www.youtube.com/shorts/BaW_jenozKc。", "https://m.youtube.com/embed/BaW_jenozKc"]:
            self.assertEqual(service.canonical_url(source), target)

    def test_reject_untrusted_and_non_video_links(self):
        for source in [None, [], "x" * 8193, "http://127.0.0.1/", "file:///etc/passwd",
                       "https://youtube.com.evil.test/watch?v=BaW_jenozKc",
                       "https://youtube.com@evil.test/watch?v=BaW_jenozKc",
                       "https://user@youtube.com/watch?v=BaW_jenozKc",
                       "https://youtube.com:443/watch?v=BaW_jenozKc",
                       "https://youtube.com/playlist?list=abc", "https://youtu.be/bad"]:
            with self.subTest(source=source), self.assertRaises(service.ParseError) as exc:
                service.canonical_url(source)
            self.assertEqual(exc.exception.code, 400)

    def format(self, name, video, audio, height=720, **extra):
        return dict(format_id=name, url="https://rr1.googlevideo.com/videoplayback?id=" + name,
                    vcodec="avc1" if video else "none", acodec="mp4a" if audio else "none",
                    height=height, protocol="https", ext="mp4", **extra)

    def test_complete_format_preferred_over_silent_hd(self):
        data = service.normalize({"formats": [self.format("hd", True, False, 1080), self.format("complete", True, True)]})
        self.assertFalse(data["requires_merge"])
        self.assertTrue(data["url"].endswith("complete"))
        self.assertEqual(data["quality"], "720P")

    def test_concurrency_limit_rejects_without_extraction(self):
        service.SLOTS.acquire()
        service.SLOTS.acquire()
        try:
            with self.assertRaises(service.ParseError) as exc:
                service.parse_video("https://youtu.be/BaW_jenozKc")
            self.assertEqual(exc.exception.code, 429)
        finally:
            service.SLOTS.release()
            service.SLOTS.release()

    def test_separate_streams_are_explicit(self):
        data = service.normalize({"formats": [self.format("video", True, False), self.format("audio", False, True)]})
        self.assertTrue(data["requires_merge"])
        self.assertIsNone(data["url"])
        self.assertTrue(data["video_url"].endswith("video"))
        self.assertTrue(data["audio_url"].endswith("audio"))

    def test_incomplete_live_and_untrusted_media_rejected(self):
        cases = [{"formats": [self.format("silent", True, False)]}, {"is_live": True},
                 {"formats": [dict(self.format("bad", True, True), url="https://evil.test/file")]},
                 {"formats": [self.format("drm", True, True, has_drm=True)]}]
        for info in cases:
            with self.assertRaises(service.ParseError) as exc:
                service.normalize(info)
            self.assertEqual(exc.exception.code, 422)


if __name__ == "__main__":
    unittest.main()
