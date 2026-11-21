#!/bin/sh
set -eu
uid=$(id -u svyoutube)
iptables -w -N SV_YOUTUBE_EGRESS 2>/dev/null || true
iptables -w -F SV_YOUTUBE_EGRESS
# Reply to PHP connections without permitting new outbound connections to localhost.
iptables -w -A SV_YOUTUBE_EGRESS -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -A SV_YOUTUBE_EGRESS -p udp -d 127.0.0.53 --dport 53 -j ACCEPT
iptables -w -A SV_YOUTUBE_EGRESS -p tcp -d 127.0.0.53 --dport 53 -j ACCEPT
for cidr in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 192.0.0.0/24 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4 154.51.40.147/32; do
    iptables -w -A SV_YOUTUBE_EGRESS -d "$cidr" -j REJECT
done
iptables -w -A SV_YOUTUBE_EGRESS -p tcp -m multiport --dports 80,443 -j ACCEPT
iptables -w -A SV_YOUTUBE_EGRESS -j REJECT
iptables -w -C OUTPUT -m owner --uid-owner "$uid" -j SV_YOUTUBE_EGRESS 2>/dev/null || iptables -w -I OUTPUT 1 -m owner --uid-owner "$uid" -j SV_YOUTUBE_EGRESS
ip6tables -w -C OUTPUT -m owner --uid-owner "$uid" -j REJECT 2>/dev/null || ip6tables -w -I OUTPUT 1 -m owner --uid-owner "$uid" -j REJECT
