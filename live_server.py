#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
OP 籌碼贏家 Pro — 本地即時行情伺服器 (內建臺灣期貨交易所 TAIFEX MIS 代理)
執行方式: python live_server.py (預設開啟 http://127.0.0.1:8088)
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen


class TaifexProxyHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith("/taifex-mis/"):
            endpoint = self.path[len("/taifex-mis/"):]
            target_url = "https://mis.taifex.com.tw/futures/api/" + endpoint
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length > 0 else b"{}"
            try:
                req = Request(
                    target_url,
                    data=body,
                    headers={
                        "Content-Type": "application/json;charset=UTF-8",
                        "User-Agent": "Mozilla/5.0",
                    },
                )
                with urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json;charset=UTF-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json;charset=UTF-8")
                self.end_headers()
                self.wfile.write(('{"error":"' + str(e) + '"}').encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    print("Serving OP Chip Winner Pro (with Live TAIFEX MIS Proxy) at http://127.0.0.1:{0}".format(port))
    HTTPServer(("127.0.0.1", port), TaifexProxyHandler).serve_forever()
