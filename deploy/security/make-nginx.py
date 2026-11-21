import pathlib,urllib.request,ipaddress,json
out=pathlib.Path('/root/short-videos-deploy/security')
ranges=[]
cf=json.loads(urllib.request.urlopen('https://api.cloudflare.com/client/v4/ips',timeout=15).read())['result']
for version in [4,6]:
    values=cf['ipv'+str(version)+'_cidrs']
    for item in values:
        net=ipaddress.ip_network(item)
        assert net.version==version
    assert len(values)>=5
    ranges+=values
geo='geo $realip_remote_addr $sv_origin_ok {\n    default 0;\n    127.0.0.1/32 1;\n    ::1/128 1;\n'+''.join('    '+x+' 1;\n' for x in ranges)+'}\n'
limits='''limit_req_zone $binary_remote_addr zone=short_videos_api:10m rate=10r/m;
limit_req_zone $server_name zone=sv_api_total:1m rate=60r/m;
limit_req_zone $binary_remote_addr zone=sv_site_ip:10m rate=10r/s;
limit_req_zone $server_name zone=sv_site_total:1m rate=50r/s;
limit_conn_zone $binary_remote_addr zone=sv_conn_ip:10m;
limit_conn_zone $server_name zone=sv_conn_total:1m;
log_format short_videos '$remote_addr [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent';
'''
server='''server {
    listen 8443 ssl http2;
    listen [::]:8443 ssl http2;
    server_name sv.litcheng.com;
    if ($sv_origin_ok = 0) { return 403; }
    REAL_IP
    real_ip_header CF-Connecting-IP;
    real_ip_recursive on;
    ssl_certificate /etc/letsencrypt/live/sv.litcheng.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sv.litcheng.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /var/www/short-videos/current;
    index index.html;
    access_log /var/log/nginx/short-videos.access.log short_videos;
    error_log /var/log/nginx/short-videos.error.log;
    client_max_body_size 16k;
    client_body_timeout 10s;
    client_header_timeout 10s;
    send_timeout 15s;
    keepalive_timeout 15s;
    limit_req zone=sv_site_ip burst=30 nodelay;
    limit_req zone=sv_site_total burst=100 nodelay;
    limit_req_status 429;
    limit_conn sv_conn_ip 20;
    limit_conn sv_conn_total 100;
    limit_conn_status 429;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    error_page 497 =308 https://sv.litcheng.com$request_uri;
    location ^~ /.well-known/acme-challenge/ { root /var/lib/short-videos/acme; }
    location ~ /\\. { deny all; }
    location /_next/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
    location / { try_files $uri $uri.html $uri/ =404; }
    error_page 429 = @sv_rate_limited;
    location @sv_rate_limited {
        default_type application/json;
        add_header Cache-Control no-store always;
        add_header Retry-After 10 always;
        return 429 '{"code":429,"msg":"请求过于频繁，请稍等十秒再试"}';
    }
    error_page 404 /404.html;
    location = /api/svproxyurl.php {
        add_header Cache-Control no-store always;
        return 307 https://media.litcheng.com/$is_args$args;
    }
    location ~ ^/api/(douyin/douyin|kuaishou/ksjx|xiaohongshu/xhsjx|bilibili/bilibili|youtube/youtube|weibo|toutiao|ppxia|pipigx|zuiyou)\\.php$ {
        try_files $uri =404;
        limit_req zone=short_videos_api burst=3 nodelay;
        limit_req zone=sv_api_total burst=10 nodelay;
        limit_req_status 429;
        limit_conn sv_conn_ip 2;
        limit_conn sv_conn_total 4;
        limit_conn_status 429;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/short-videos.sock;
        fastcgi_read_timeout 40s;
        fastcgi_hide_header Access-Control-Allow-Origin;
        add_header Access-Control-Allow-Origin https://sv.litcheng.com always;
        add_header Cache-Control no-store always;
        add_header X-Content-Type-Options nosniff always;
    }
    location ~ ^/api/ { return 404; }
}
'''.replace('    REAL_IP',''.join('    set_real_ip_from '+x+';\n' for x in ranges).rstrip())
(out/'nginx.conf').write_text(limits+geo+server)
print('Validated Cloudflare networks:',len(ranges))
