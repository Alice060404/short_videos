# YouTube 本地接入测试（2026-11-07）

仅在 Windows 本地执行。未连接或部署 `us`，未修改线上 Nginx、PHP-FPM、出站防火墙或 Cloudflare Worker。

## 实现

- PHP 接口：`api/youtube/youtube.php`，GET 查询或 POST 表单参数 `url`。
- 内部服务：`services/youtube/service.py`，固定监听 127.0.0.1，使用独立 Python 进程执行 yt-dlp。
- 已加入 `api/sv.php` 聚合平台表和 PHP 入口校验表；未增加网页平台入口。
- 返回现有 JSON 视频字段和格式列表，区分完整文件与分离音画。不会把无声视频放入完整视频 `url` 字段。
- 安装环境：Python 3.12、PHP 8.4.27、Node.js 24.22.2、yt-dlp 2026.10.26、yt-dlp-ejs 0.8.0。FFmpeg/ffprobe 仅用于测试验证，解析接口本身不执行合并。
- 本次虚拟环境位于工作区 `D:/my-projects/short_videos/.local-youtube-venv`，项目源码位于其下的 `short_videos` 目录。

## 实际网络结果

| 样本 | 结果 |
|---|---|
| `https://youtu.be/jNQXAC9IVRw` | PHP HTTP 200，标题 Me at the zoo，17 个媒体格式；最后一次解析约 4.59 秒 |
| 同一视频 `youtube.com/watch?v=...` | POST HTTP 200；媒体 Range HTTP 206 |
| `https://www.youtube.com/shorts/1iOz67cPc54` | PHP HTTP 200，26 个媒体格式，约 4.30 秒；媒体 Range HTTP 206，video/mp4，读取 1024 字节 |
| `https://www.youtube.com/shorts/iFeRv8DK7gk` | 上游显示 Private video；PHP HTTP 422，提示不可公开访问或已移除 |
| `https://www.youtube.com/shorts/jg4892E8HxU` | HTTP 422，YouTube 要求额外验证，匿名解析不可用 |
| 旧测试样本 `BaW_jenozKc` | 初次测试未取得可用媒体直链，HTTP 422；未当作成功样本 |
| 内网 URL、伪造域名、纯播放列表 URL | HTTP 400，拒绝请求 |

对 Me at the zoo 的完整格式进行了实际完整下载，文件 629,172 字节。ffprobe 确认 H.264 视频（320×240）、AAC 音频、时长 18.947483 秒。文件保存在被 Git 忽略的 `.youtube-test/me-at-the-zoo.mp4`。Shorts 仅验证了解析和少量媒体读取，未做完整文件下载。

## 自动检查

- 6 项 Python 单元测试通过：链接规范化、不可信输入拒绝、完整音画优先、分离音画标记、不完整/直播/DRM/外站媒体拒绝、并发限制。
- 新 PHP 入口、聚合入口及改动的公共库 PHP 语法检查通过。
- 既有 `public_media_test.php` 和 `security_test.php` 回归通过。
- 可重复联网脚本 `tests/youtube_live_test.py`：检测真实 PHP 响应和媒体 Range 可访问性；上游失败或媒体不可访问时返回非零退出码。

## 结论和边界

本地已实证可解析并访问公开普通视频和公开 Shorts 的媒体。样本有限，不代表所有 YouTube 视频均可用；私密、登录或风控受限视频会失败。分离音画的返回契约通过单元测试，未对该分支做真实下载合并验收。聚合转发未在 PHP 单进程测试服务器验收；本次使用单平台接口。没有验证服务器 IP、Cloudflare 转发、网页播放或线上部署。

启动和调用方式见 [接口说明](../services/youtube/README.md)。
