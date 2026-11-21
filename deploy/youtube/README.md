# YouTube 服务发布配置

这些配置已于 2026-11-08 应用到 us 正式服务，详见 [部署记录及回滚信息](../../docs/YouTube部署记录-2026-11-08.md)。下列步骤供后续发布参考，不要单独上传前端后就开放 YouTube。

## 准备版本

将项目放到服务器暂存目录，在该目录运行 `sudo sh deploy/youtube/prepare.sh "$PWD"`。需要系统已有 python3-venv、Node >=22、curl、iptables 和 systemd。脚本创建专用 svyoutube 用户和 `/opt/short-videos-youtube/releases/<时间>` 虚拟环境，不启动服务、不切换网站。记录输出路径。

## 正式发布时执行

1. 备份现有 Nginx、PHP 出站脚本、服务 current 链接和网站 release 路径。
2. 将 `egress.sh` 安装到 `/usr/local/sbin/short-videos-youtube-egress`（0755）；两个 `.service` 安装到 `/etc/systemd/system/`（0644）。
3. 将 `/opt/short-videos-youtube/current` 链接指向准备好的版本；执行 `systemctl daemon-reload`、`systemctl enable --now short-videos-youtube-egress.service short-videos-youtube.service`。新服务只绑定 127.0.0.1。
4. 执行 `curl --fail http://127.0.0.1:8765/health`；通过后才继续。失败时保留旧网站版本，检查 `journalctl -u short-videos-youtube`。
5. 将 `deploy/security/parser-egress.sh` 安装到 `/usr/local/sbin/short-videos-egress`，重启 `short-videos-egress.service`。仅增加 svparser 到本机 TCP 8765 的权限，不放开其他内网。
6. 用 svparser 身份请求 health，验证 PHP 用户能连接；确认访问其他内网端口仍被拒绝。
7. 在暂存 release 中同步 PHP API、公共库和新 `web/out/`。将正式 Nginx 原入口正则中的 `bilibili/bilibili` 后加入 `youtube/youtube`（更新后的生成模板已有该项）；保留限流、可信源站等配置。`nginx -t` 成功后再受控发布和 reload。不要执行旧的首次部署脚本覆盖安全配置。
8. 从服务器解析长视频与 Shorts，并从客户端网络读取媒体；完成网页播放、分离音画和错误提示验收。

源站 IP 与用户 IP 不同，直链是否可用须以跨网络测试为准；若需中转媒体，应另行设计有限流、签名、大小和时长限制的下载服务，不要把当前解析服务直接改成任意 URL 代理。

## 回滚

恢复配套的旧网站 release 和 Nginx 配置，`nginx -t` 后 reload；停止新 YouTube 服务或将其 current 链接恢复到旧服务版本再 restart。恢复旧 PHP 出站脚本并重启其 oneshot 服务。新 UID 的防火墙链可以保留为默认限制；不要清空全局防火墙。现有其他平台媒体签名配置保持一致。
