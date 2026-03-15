"""
Browser Agent Module — Навигация по сайтам, парсинг, проверка доступности.
Использует requests + BeautifulSoup для headless browsing.
Может проверять работоспособность сайтов, получать контент, парсить HTML.
"""

import requests
from urllib.parse import urljoin, urlparse
import re
import json
import time


class BrowserAgent:
    """Headless browser agent for web navigation and parsing."""

    def __init__(self, timeout=30):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        })
        self.history = []

    def navigate(self, url):
        """Navigate to a URL and return page content."""
        try:
            if not url.startswith(("http://", "https://")):
                url = "https://" + url

            resp = self.session.get(url, timeout=self.timeout, allow_redirects=True, verify=False)
            self.history.append({"url": url, "status": resp.status_code, "time": time.time()})

            return {
                "success": True,
                "url": resp.url,
                "status_code": resp.status_code,
                "content_type": resp.headers.get("Content-Type", ""),
                "html": resp.text[:100000],  # Limit to 100KB
                "headers": dict(resp.headers),
                "elapsed_ms": int(resp.elapsed.total_seconds() * 1000)
            }
        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }

    def check_site(self, url):
        """Check if a website is accessible and return status info."""
        try:
            if not url.startswith(("http://", "https://")):
                url = "https://" + url

            start = time.time()
            resp = self.session.get(url, timeout=self.timeout, allow_redirects=True, verify=False)
            elapsed = round((time.time() - start) * 1000)

            # Extract title
            title = ""
            title_match = re.search(r"<title[^>]*>(.*?)</title>", resp.text, re.IGNORECASE | re.DOTALL)
            if title_match:
                title = title_match.group(1).strip()

            return {
                "success": True,
                "url": resp.url,
                "status_code": resp.status_code,
                "title": title,
                "response_time_ms": elapsed,
                "content_length": len(resp.text),
                "is_https": resp.url.startswith("https://"),
                "server": resp.headers.get("Server", "unknown"),
            }
        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }

    def get_text(self, url):
        """Get clean text content from a webpage."""
        result = self.navigate(url)
        if not result["success"]:
            return result

        html = result["html"]

        # Remove scripts and styles
        html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)

        # Remove tags
        text = re.sub(r"<[^>]+>", " ", html)
        # Clean whitespace
        text = re.sub(r"\s+", " ", text).strip()
        # Limit length
        if len(text) > 20000:
            text = text[:20000] + "... [truncated]"

        return {
            "success": True,
            "url": result["url"],
            "text": text,
            "status_code": result["status_code"]
        }

    def get_links(self, url):
        """Extract all links from a webpage."""
        result = self.navigate(url)
        if not result["success"]:
            return result

        html = result["html"]
        links = []
        for match in re.finditer(r'<a[^>]+href=["\']([^"\']+)["\']', html, re.IGNORECASE):
            href = match.group(1)
            if href.startswith(("javascript:", "#", "mailto:", "tel:")):
                continue
            absolute = urljoin(result["url"], href)
            links.append(absolute)

        # Deduplicate
        links = list(dict.fromkeys(links))

        return {
            "success": True,
            "url": result["url"],
            "links": links[:200],  # Limit to 200 links
            "count": len(links)
        }

    def post_data(self, url, data=None, json_data=None, headers=None):
        """Send POST request to a URL."""
        try:
            if not url.startswith(("http://", "https://")):
                url = "https://" + url

            extra_headers = headers or {}
            resp = self.session.post(
                url,
                data=data,
                json=json_data,
                headers=extra_headers,
                timeout=self.timeout,
                verify=False
            )

            return {
                "success": True,
                "url": resp.url,
                "status_code": resp.status_code,
                "response": resp.text[:50000],
                "headers": dict(resp.headers)
            }
        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }

    def check_api(self, url, method="GET", data=None, headers=None):
        """Check an API endpoint."""
        try:
            if not url.startswith(("http://", "https://")):
                url = "https://" + url

            extra_headers = {"Content-Type": "application/json"}
            if headers:
                extra_headers.update(headers)

            start = time.time()
            if method.upper() == "GET":
                resp = self.session.get(url, headers=extra_headers, timeout=self.timeout, verify=False)
            elif method.upper() == "POST":
                resp = self.session.post(url, json=data, headers=extra_headers, timeout=self.timeout, verify=False)
            elif method.upper() == "PUT":
                resp = self.session.put(url, json=data, headers=extra_headers, timeout=self.timeout, verify=False)
            elif method.upper() == "DELETE":
                resp = self.session.delete(url, headers=extra_headers, timeout=self.timeout, verify=False)
            else:
                return {"success": False, "error": f"Unsupported method: {method}"}

            elapsed = round((time.time() - start) * 1000)

            # Try to parse JSON
            try:
                json_response = resp.json()
            except:
                json_response = None

            return {
                "success": True,
                "url": resp.url,
                "method": method.upper(),
                "status_code": resp.status_code,
                "response_time_ms": elapsed,
                "json": json_response,
                "text": resp.text[:20000] if not json_response else None,
                "headers": dict(resp.headers)
            }
        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e)
            }

    def screenshot_check(self, url):
        """Check visual aspects of a site (headers, meta, resources)."""
        result = self.navigate(url)
        if not result["success"]:
            return result

        html = result["html"]

        # Extract meta info
        metas = {}
        for match in re.finditer(r'<meta[^>]+>', html, re.IGNORECASE):
            tag = match.group(0)
            name = re.search(r'name=["\']([^"\']+)["\']', tag)
            content = re.search(r'content=["\']([^"\']+)["\']', tag)
            if name and content:
                metas[name.group(1)] = content.group(1)

        # Count resources
        scripts = len(re.findall(r'<script', html, re.IGNORECASE))
        styles = len(re.findall(r'<link[^>]+stylesheet', html, re.IGNORECASE))
        images = len(re.findall(r'<img', html, re.IGNORECASE))

        # Extract title
        title = ""
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_match:
            title = title_match.group(1).strip()

        return {
            "success": True,
            "url": result["url"],
            "title": title,
            "meta": metas,
            "resources": {
                "scripts": scripts,
                "stylesheets": styles,
                "images": images
            },
            "html_size": len(html),
            "status_code": result["status_code"]
        }
