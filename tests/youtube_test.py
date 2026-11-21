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


class XTests(unittest.TestCase):
    def test_canonical_links(self):
        for source in ["https://x.com/oshtru/status/1577855540407197696",
                       "看看 https://twitter.com/oshtru/status/1577855540407197696?s=20&t=abc。",
                       "https://mobile.twitter.com/oshtru/status/1577855540407197696/photo/1",
                       "https://www.x.com/i/web/status/1577855540407197696",
                       "https://x.com/i/status/1577855540407197696/video/1"]:
            with self.subTest(source=source):
                self.assertEqual(service.canonical_x_url(source),
                                 ("https://x.com/i/status/1577855540407197696", "1577855540407197696"))

    def test_reject_untrusted_and_non_post_links(self):
        for source in [None, "x" * 8193, "https://x.com.evil.test/a/status/1", "https://pipix.com/a/status/1",
                       "https://user@x.com/a/status/1", "https://x.com:443/a/status/1", "https://x.com/elonmusk",
                       "https://x.com/a/status/abc", "https://t.co/abc", "https://x.com/a/status/1/likes"]:
            with self.subTest(source=source), self.assertRaises(service.ParseError) as exc:
                service.canonical_x_url(source)
            self.assertEqual(exc.exception.code, 400)

    def test_platform_routing(self):
        with self.assertRaises(service.ParseError) as exc:
            service.parse_video("https://x.com/a/status/1", "tiktok")
        self.assertEqual(exc.exception.code, 400)
        with self.assertRaises(service.ParseError) as exc:
            service.parse_video("https://youtu.be/BaW_jenozKc", "x")
        self.assertEqual(exc.exception.code, 400)

    user = {"name": "Osh", "screen_name": "oshtru",
            "profile_image_url_https": "https://pbs.twimg.com/profile_images/1/a_normal.jpg"}

    def video(self, mid, kind="video"):
        return {"type": kind, "media_url_https": f"https://pbs.twimg.com/ext_tw_video_thumb/{mid}/pu/img/t.jpg",
                "video_info": {"duration_millis": 12500, "variants": [
                    {"content_type": "application/x-mpegURL", "url": f"https://video.twimg.com/{mid}/pl.m3u8"},
                    {"content_type": "video/mp4", "bitrate": 256000, "url": f"https://video.twimg.com/{mid}/vid/320x568/low.mp4"},
                    {"content_type": "video/mp4", "bitrate": 2176000, "url": f"https://video.twimg.com/{mid}/vid/720x1280/high.mp4"},
                    {"content_type": "video/mp4", "bitrate": 9000000, "url": "https://evil.test/vid/1080x1920/x.mp4"},
                ]}}

    def test_mixed_post_video_and_photos(self):
        status = {"id_str": "1", "full_text": "gm &amp; hi https://t.co/link https://t.co/media",
                  "created_at": "Thu Oct 06 02:57:30 +0000 2022", "user": self.user,
                  "entities": {"urls": [{"url": "https://t.co/link", "expanded_url": "https://example.com/a"}],
                               "media": [{"url": "https://t.co/media"}]},
                  "extended_entities": {"media": [
                      {"type": "photo", "media_url_https": "https://pbs.twimg.com/media/AAA.jpg"},
                      self.video("11"), self.video("22", "animated_gif"),
                      {"type": "photo", "media_url_https": "https://evil.test/media/BBB.jpg"}]}}
        data = service.normalize_x(status, "1")
        self.assertEqual(data["type"], "video")
        self.assertEqual(data["url"], "https://video.twimg.com/11/vid/720x1280/high.mp4")
        self.assertEqual(data["quality"], "720P")
        self.assertEqual(data["duration"], 12.5)
        self.assertEqual(data["images"], ["https://pbs.twimg.com/media/AAA.jpg?name=orig"])
        self.assertEqual(data["video_backup"], [{"label": "视频 2 · 720P", "url": "https://video.twimg.com/22/vid/720x1280/high.mp4"}])
        self.assertEqual(data["desc"], "gm & hi https://example.com/a")
        self.assertEqual(data["author"], {"name": "Osh", "id": "oshtru", "avatar": "https://pbs.twimg.com/profile_images/1/a_400x400.jpg"})
        self.assertEqual(data["publish_time"], "1665025050")
        self.assertEqual(service.x_timestamp("2022-10-06T02:57:30.000Z"), "1665025050")
        self.assertFalse(data["requires_merge"])

    def test_photo_post_and_quoted_fallback(self):
        status = {"id_str": "2", "full_text": "pics", "user": self.user, "quoted_status": {"extended_entities": {"media": [
            {"type": "photo", "media_url_https": "https://pbs.twimg.com/media/Q1.png"},
            {"type": "photo", "media_url_https": "https://pbs.twimg.com/media/Q2.jpg"}]}}}
        data = service.normalize_x(status, "2")
        self.assertEqual(data["type"], "image")
        self.assertIsNone(data["url"])
        self.assertEqual(len(data["images"]), 2)
        self.assertEqual(data["cover"], data["images"][0])

    def test_text_only_and_missing_posts(self):
        data = service.normalize_x({"id_str": "20", "full_text": "just setting up my twttr", "user": self.user}, "20")
        self.assertEqual((data["type"], data["images"], data["title"]), ("image", [], "just setting up my twttr"))
        for status in [{}, None, {"user": self.user}]:
            with self.assertRaises(service.ParseError) as exc:
                service.normalize_x(status, "3")
            self.assertEqual(exc.exception.code, 422)
        only_bad_video = {"id_str": "4", "full_text": "v", "extended_entities": {"media": [
            {"type": "video", "video_info": {"variants": [{"content_type": "application/x-mpegURL", "url": "https://video.twimg.com/a.m3u8"}]}}]}}
        with self.assertRaises(service.ParseError) as exc:
            service.normalize_x(only_bad_video, "4")
        self.assertEqual(exc.exception.code, 422)


if __name__ == "__main__":
    unittest.main()
