# YouTube 与 X（Twitter）本地解析接口

已接入网页并共享本机 `yt-dlp` 解析服务（`services/youtube/service.py`，监听 `127.0.0.1:8765`）；YouTube 与 X 媒体直链均不通过现有 Cloudflare Worker。需要 Python 3.10+、PHP 8+（curl）及 Node.js >=22 或受支持的 Deno。当前固定 yt-dlp 2026.10.21，以兼容 us 的 Python 3.10；2026.10.26 要求 Python >=3.11，不能直接用于当前服务器。部署说明见 [部署配置](../../deploy/youtube/README.md)，验收见 [部署记录](../../docs/YouTube部署记录-2026-11-08.md)。

## 启动

在项目根目录 `short_videos/` 执行（Windows PowerShell）：

```powershell
python -m venv .venv-youtube
.\.venv-youtube\Scripts\python.exe -m pip install -r services/youtube/requirements.txt
.\.venv-youtube\Scripts\python.exe services/youtube/service.py
```

另开终端运行：

```powershell
php -S 127.0.0.1:8088 -t .
```

接口：
- YouTube：`GET /api/youtube/youtube.php?url=<URL编码后的分享链接>`（亦支持 POST 表单 `url`）
- X（Twitter）：`GET /api/x/x.php?url=<URL编码后的帖子链接>`（亦支持 POST 表单 `url`）

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8088/api/youtube/youtube.php -Body @{url='https://youtu.be/jNQXAC9IVRw'}
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8088/api/x/x.php -Body @{url='https://x.com/oshtru/status/1577855540407197696'}
```

Python 服务固定仅监听 `127.0.0.1:8765`，PHP 不执行系统命令，由 `api/lib/ytdlp_service.php` 统一通过 `platform`（`youtube` / `x`）调用。服务 `/health` 返回 yt-dlp 版本。不要将该内部服务公开到公网。

聚合入口 `api/sv.php` 已注册 YouTube 与 X；PHP 内置单进程服务器不能转发请求给自身，故本地用单平台接口测试。聚合入口需在多进程 Web 环境及已有可信 Host 配置下使用。

## 输出与范围

- **YouTube**：支持普通 watch 链接、youtu.be 短链接、Shorts 和 embed 单视频地址；会重建规范 URL，不跟随用户提供的任意跳转，也不处理列表参数。
- **X（Twitter）**：支持 `x.com`、`twitter.com`、`mobile.x.com`、`mobile.twitter.com` 单条帖子链接（`/用户名/status/ID`、`/i/status/ID`、`/i/web/status/ID`，兼容末尾 `/photo/1` 或 `/video/1`）；通过 `yt-dlp` 的 `TwitterIE` 获取访客令牌并提取单帖数据：
  - 视频 / GIF 帖子：筛选 `video.twimg.com` 的带音画 MP4 直链（按分辨率与码率择优），多视频帖子其余视频写入 `video_backup`；
  - 图文 / 图集帖子：提取 `pbs.twimg.com` 原图（`?name=orig`）写入 `images`；
  - 视频与图片混排帖子：同时返回主视频 `url` 与原图列表 `images`；
  - 引用帖与纯文字帖：若主帖无媒体则自动回退引用帖媒体，展开正文中的 `t.co` 链接并剔除末尾媒体短链。
- 统一返回 `{code,msg,data}`；data 包含 title、cover、author、duration、quality 等现有字段，以及 formats、requires_merge、video_url、audio_url。
- 有带音频的完整格式时，`url` 返回该格式（优先 MP4），`requires_merge=false`。
- 仅有分离格式时，`url=null`、`requires_merge=true`，通过 video_url/audio_url 获取两个流；formats 提供格式、编码和清晰度。网页显示“视频（无声）”“音频”和合并提示，预览仅播放视频流，不自动合并。
- 不执行媒体下载、FFmpeg 合并、转码，也不提供永久链接。客户端需要自行合并或后续增加下载任务服务。
- 不读取浏览器 Cookie，不支持登录、会员内容、播放列表及进行中的直播。不自动下载远程 JS 组件，使用安装包内的 EJS。
- 不通过现有 Cloudflare Worker 代理 YouTube 媒体。链接可能有 IP/请求头/有效期限制；解析成功后需在实际下载环境验证。
- 并发上限 2，单次解析 24 秒；忙返回 429、超时 504、上游错误 502、风控或不可用格式 422、非法输入 400。PHP 响应体限制 4 MiB。

上线前还需独立配置服务用户、资源与出站限制、Nginx 入口及本机通信权限，并验证真实部署网络；不能直接套用当前 PHP 出站限制。

## 测试

```powershell
python tests/youtube_test.py
php -l api/youtube/youtube.php
php tests/public_media_test.php
php tests/security_test.php
python tests/youtube_deploy_test.py
node tests/youtube_frontend_test.cjs
# 启动上述两个服务后，执行真实联网解析和媒体 Range 验证：
python tests/youtube_live_test.py
# 可以传入自己需要验证的公开视频：
python tests/youtube_live_test.py https://www.youtube.com/shorts/VIDEO_ID
# 显式执行远程临时检查：创建/清理临时环境，不部署正式服务
python tests/youtube_remote_check.py --host us
```

真实链接可能受网络、地区和 YouTube 风控影响。维护时应显式更新 requirements.txt 中的 yt-dlp 版本并复测。
