# -*- coding: utf-8 -*-
"""
小洛小洛 · 本地开发服务器（带禁用缓存头）
==========================================
为什么需要它：python 自带的 http.server 不发缓存控制头，
浏览器会自作主张缓存旧页面，导致"改了代码刷新却没变化"。

用法（代替 python -m http.server）：
    python serve.py
然后浏览器打开 http://127.0.0.1:8765

它和 http.server 功能完全一样，只是多告诉浏览器：
"每次都来拿最新版，别用缓存"。
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))  # 以本文件所在目录为网站根目录


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 告诉浏览器：不要缓存，每次都向服务器要最新文件
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = 8765
    print(f"小洛小洛开发服务器已启动：http://127.0.0.1:{port}  （Ctrl+C 停止）")
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
