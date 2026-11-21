# us 部署记录（2026-11-06）

## YouTube 正式发布（2026-11-08，最新版本）

当前站点 release 为 `/var/www/short-videos/releases/20261108-youtube-132246`，新增 YouTube 普通长视频与 Shorts 前端/API、独立解析服务和必要的精确网络权限。Nginx PHP 白名单由 9 个入口增加到 10 个，其余既有安全策略保留。公网 YouTube、B 站、微博、抖音解析和媒体 Range 均通过。完整配置、验收边界及回滚步骤见 [YouTube 部署记录](YouTube部署记录-2026-11-08.md)。

## 安全加固（2026-11-06，最新配置）

本节覆盖下方历史记录中的版本和安全限制。发布目录 `/var/www/short-videos/releases/20261106-04-security`，Worker 版本 `9ccd50da-813a-4644-b868-39ef58edf7ce`。

- Nginx 仅执行前端使用的 9 个解析入口；其余 `/api/` 路径返回 404。旧媒体入口仍为纯 307 跳转，不能在源站下载媒体。
- 解析接口每 IP 10 次/分钟（突发 3），全站 60 次/分钟（突发 10）；并发每 IP 2、全站 4，超限 429。静态站另有每 IP 10 次/秒、全站 50 次/秒限制。
- 独立 PHP 用户 `svparser`，最多 4 个进程，每进程内存 96 MB，硬超时 35 秒，关闭 URL 文件流和命令执行函数，限制文件访问范围。临时目录通过 tmpfiles 在重启后恢复。
- 入口校验平台域名；HTTP 每跳验证域名、公开 IPv4、TLS，并固定 DNS 解析结果，响应体上限 4 MB。抖音媒体跳转探测改为 HEAD，避免解析时下载整个视频。
- 独立 UID 的出站防火墙禁止内网、元数据地址、源站公网 IP 和 IPv6，只允许外部 TCP 80/443 及本机 DNS。规则由 `short-videos-egress.service` 启动恢复，其他用户的服务不受规则匹配。
- 本站 8443 虚拟主机只接受 Cloudflare 官方网段和本机连接；真实客户端 IP 仅信任这些网段。未改邮箱配置、443 服务或其他站点。
- 抖音、微博、B 站媒体地址由源站生成 HMAC-SHA256 签名，30 分钟过期。Worker 在请求媒体前验签；缺失、伪造、过期均拒绝。旧历史记录中的无签名链接需重新解析。
- 签名密钥只保存在源站 `/etc/short-videos/media-signing.key`（root:svparser，640）与 Worker Secret `MEDIA_SIGNING_KEY`，不在前端或仓库中。
- Worker 限流：每 IP 120 次/分钟、每签名 60 次/分钟、每数据中心总计 1200 次/分钟；单次响应最多 512 MiB，媒体流最多 5 分钟。此限流属于边缘本地近似限流，不是全球严格总额度或费用封顶。
- 媒体仍由 Cloudflare 直接从平台 CDN 获取；源站只承担网页和有界解析请求。公开解析接口仍可能被持续调用，拒绝的请求也会产生少量资源开销，不能承诺零资源消耗或免疫分布式攻击。
- 备份位于 `/root/short-videos-deploy/security-backup/`。不要只回滚 API/前端而保留强制验签 Worker，否则旧链接会失败。
- 上线验收：首页 200；B 站、微博、抖音解析均 code=200 且签名下载 Range 返回 206/1024 字节；伪造与无签名链接 403；非入口 API 404；非法 URL 400；小规模连续请求触发 429 JSON；直连源站 403；ACME 路径 200；webmail.litcheng.com 返回 200。PHP 安全回归、Worker 安全回归和前端构建通过。未进行破坏性压测或全部平台逐项验收。
- 配置源码：`deploy/security/`；PHP 安全回归：`tests/security_test.php`；Worker 安全回归：`cf_sv_proxy/worker.test.mjs`。


## B 站和微博修复（2026-11-06，历史版本）

本节覆盖下方历史记录中“B 站/微博解析失败”的状态。

- 当前服务器版本：/var/www/short-videos/releases/20261106-03-parsers。
- B 站根因：旧 Chrome 请求头触发上游 HTTP 412，旧代码忽略 HTTP/JSON 错误；还擅自替换签名媒体 URL 的 CDN 域名。改为应用请求头、有效错误检查、保留原始 CDN URL，并支持 BV/AV 编号及指定 p 分集。
- 微博根因：缺少匿名访客会话初始化、引用未定义的 CONNECTION_TIMEOUT，并把媒体包装为第三方代理 URL。现在仅创建每次请求独立的匿名访客会话，支持 TV 页和正文链接，返回原始媒体 URL，不需要用户登录 Cookie。
- 公共 HTTP 客户端 api/lib/public_media.php 限定请求及重定向域名、验证 TLS、限制响应体 4 MB，整次解析截止时间 25 秒。媒体内容不经过此客户端。
- B 站媒体和封面也改走 media.litcheng.com Worker。新增 bilivideo.com、bilivideo.cn、hdslb.com 和具体的 upos-hz-mirrorakam.akamaized.net 白名单，不放开整个 akamaized.net。
- 网页视频、封面及图像预览也使用 Worker 的 download=false，下载使用 attachment；保留 Range/206。源站旧媒体入口仍只做 307 跳转。
- 暂存验收：B 站 BV 和 AV、微博 TV 和正文四种真实链接均成功；正式 B 站和微博接口均返回 code=200。
- 本机完整下载：B 站 HTTP 200、video/mp4、4,298,716 字节，与上游 size 完全一致；微博 HTTP 200、video/mp4、1,016,383 字节。两者均检查到 MP4 ftyp 标识及正确内联响应。Worker 分段请求均返回 206。
- PHP 语法检查、针对域名校验/清晰度选择/URL 归一化/微博字段的回归测试，以及前端生产构建已通过。回归测试：tests/public_media_test.php；Worker 测试：cf_sv_proxy/worker.test.mjs。
- 浏览器控制连接不可用，未完成页面内点击播放的交互验收。登录限制、付费内容及平台后续风控仍可能影响其他作品。
- 公开匿名访客流程参考：https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/weibo.py


## 当前状态：已迁移到 Cloudflare Worker（2026-11-06 后续更新）

以下内容覆盖本文后面的首次部署记录中的媒体代理配置。

- 页面和解析仍由 https://sv.litcheng.com 提供，媒体代理改为 https://media.litcheng.com/，由 Cloudflare Worker short-videos-media 直接向平台 CDN 请求并流式返回。
- Worker 代码和配置位于 cf_sv_proxy/worker.js、cf_sv_proxy/wrangler.jsonc。CDN 白名单、CORS 和每跳重定向校验已写入源码；支持 Range / 206。
- web/.env.production 已设置 NEXT_PUBLIC_PROXY_BASE=https://media.litcheng.com/，已重新构建并上线。
- 线上 current 指向 /var/www/short-videos/releases/20261106-02-worker。旧版本保留，但不应回滚旧 Nginx 媒体中转配置。
- /api/svproxyurl.php 在 Nginx 中仅返回 307 到 Worker，保留查询参数。当前发布版本的同名 PHP 文件也已替换为纯重定向。旧页面和已保存的旧下载链接不会回退到服务器中转。
- us 不再负责抖音、微博的媒体下载传输；仍承担页面、解析请求和少量重定向流量。其他平台继续由浏览器直接访问其 CDN。
- Cloudflare 自定义域名及证书由 Worker 平台管理，不需要把 media 的 A 记录指向 us，也不需要为 media 添加 8443 回源规则。
- 已验证 Worker 的真实抖音视频 Range 请求：206，65,536 字节，Content-Range 总长 28,124,467 字节；图片 13,059 字节，image/jpeg。
- 从本机经 Worker 完整下载抖音视频成功：HTTP 200，video/mp4，28,124,467 字节，与解析结果一致；媒体下载请求没有使用 us 上的代理。
- Worker 独立于源站 Nginx 限流；原先服务器媒体入口的限流不适用于新 Worker。当前使用 CDN 白名单和本站 CORS 限制，但 CORS 不是身份认证。应在 Cloudflare 监控 Worker 用量和配额。没有启用付费套餐。
- B 站/微博解析失败的问题与本次下载迁移无关，仍未修复。

更新 Worker：在 cf_sv_proxy 目录运行 wrangler deploy；不要把生产白名单恢复为空。
旧配置备份：/root/short-videos-deploy/nginx-before-worker.conf。
本次切换脚本：deploy-us/switch-worker.sh。


正式地址：https://sv.litcheng.com
服务器：ssh us（154.51.40.147）

## 已部署

- 本地运行 npm --prefix short_videos/web run build，静态构建成功。
- 仅上传 web/out 产物和 api 目录。发布目录 /var/www/short-videos/releases/20261106-01，current 软链接指向该版本。
- 使用系统仓库 PHP 8.1 FPM，启用 curl、openssl、mbstring；独立池 /etc/php/8.1/fpm/pool.d/short-videos.conf，关闭错误显示，最多 6 个按需进程。
- Nginx 配置 /etc/nginx/conf.d/short-videos.conf，监听已有 8443 HTTPS 端口，以域名区分邮箱和视频站。未改动现有 443 服务或邮箱配置。
- Cloudflare A 记录 sv 指向服务器，开启橙云；Origin Rule short-videos-8443 匹配 (http.host eq "sv.litcheng.com")，回源端口 8443。
- 独立 Let's Encrypt 证书，当前有效期至 2027-02-04；使用 webroot 验证路径 /var/lib/short-videos/acme，certbot.timer 自动续期，部署钩子仅在本站证书更新时重载 Nginx。模拟续期成功。
- API 按真实客户端 IP 限流 20 次/分钟，媒体代理 30 次/分钟，突发额度各 10 次，超限 429。Cloudflare 可信 IP 配置复用服务器现有邮箱的列表。
- 生产部署包中的媒体白名单：douyinvod.com、douyinpic.com、snssdk.com、amemv.com、zjcdn.com、weibocdn.com、sinaimg.cn。
- 生产部署包 CORS 仅允许 https://sv.litcheng.com；关闭未使用的 /api/sv.php；禁止隐藏文件和 API 非 PHP 文件访问。
- 访问日志 /var/log/nginx/short-videos.access.log 不记录查询参数；错误日志仍可能包含请求 URL。现有 nginx logrotate 覆盖站点日志。

## 验收

- 公网首页 HTTPS 200，HTTP 308 跳转 HTTPS。
- 邮箱 https://webmail.litcheng.com 返回 200；未进行收发邮件测试。
- 隐藏文件 403，API 非 PHP 文件 403，聚合接口 404，非白名单代理请求 400。
- 抖音真实链接解析成功；通过正式域名完整下载视频 28,124,467 字节（与解析返回的大小一致），封面下载 13,059 字节，均返回 200。未执行浏览器交互预览验收。
- B 站两次链接测试返回解析失败；微博返回 Sina Visitor System 验证页面。尚未达到部署指南要求的三个平台完整解析/预览/下载验收，需后续修复或提供可用测试链接。
- 未设置各平台定时业务检测，未设置外部故障通知。
- 未添加投诉邮箱：需站点所有者提供确认可接收投诉的地址。

测试链接：
- https://www.douyin.com/video/7649780679744612849
- https://www.bilibili.com/video/BV1mGAbzmEPo/
- https://weibo.com/tv/show/1034:5096269555892239

## 更新注意

本次 CORS 和媒体白名单应用在 deploy-us/site/api 部署副本，未修改仓库 API 源码。下次更新必须重新应用这些生产配置，不能直接覆盖成仓库默认值。
前端仍使用 /api/ 和 /api/svproxyurl.php 同源路径。
本地 deploy-us 保存站点包、Nginx/PHP 配置、安装脚本及验收脚本；服务器 /root/short-videos-deploy 保存对应文件和验收 JSON。install.sh 是本次固定版本的部署记录，不应作为任意版本通用更新脚本直接复用。

常用检查：
```sh
ssh us 'nginx -t; systemctl status php8.1-fpm --no-pager'
ssh us 'certbot renew --cert-name sv.litcheng.com --dry-run --non-interactive --no-random-sleep-on-renew'
ssh us 'tail -n 50 /var/log/nginx/short-videos.error.log'
```

Cloudflare Origin Rules 官方说明：https://developers.cloudflare.com/rules/origin-rules/create-dashboard/
