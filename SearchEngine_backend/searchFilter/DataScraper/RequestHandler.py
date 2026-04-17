import requests, time, random
from selenium import webdriver
from urllib.parse import urlparse
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class RequestHandler:

    def __init__(self, proxy: dict = None):
        self.proxy = proxy

    def get(self, url: str, screenshot_path: str = None) -> str:
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option("useAutomationExtension", False)

        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

        try:
            driver.set_page_load_timeout(30)
            driver.get(url)
            selectors = self._pick_wait_selectors(url)

            try:
                WebDriverWait(driver, 10).until(
                    EC.any_of(*[
                        EC.presence_of_element_located((By.CSS_SELECTOR, sel))
                        for sel in selectors
                    ])
                )
            except TimeoutException:
                pass

            # Save screenshot if a path is provided
            if screenshot_path:
                try:
                    driver.save_screenshot(screenshot_path)
                    print(f"[Screenshot] Saved: {screenshot_path}")
                except Exception as e:
                    print(f"[Screenshot] Failed to save {screenshot_path}: {e}")

            html = driver.execute_script("return document.body.innerHTML")
            return html

        except TimeoutException:
            print(f"[TimeoutException] Failed to load {url}")
            return "<html><body><p>Timeout</p></body></html>"
        except WebDriverException as e:
            print(f"[WebDriverException] Failed to load {url}: {e}")
            return "<html><body><p>Error</p></body></html>"
        except Exception as e:
            print(f"[Exception] General failure loading {url}: {e}")
            return "<html><body><p>Unknown error</p></body></html>"
        finally:
            driver.quit()

    def _pick_wait_selectors(self, url: str):
        netloc = urlparse(url).netloc
        if "google." in netloc:
            return [
                "#rso",           # organic results container
                "#tads",          # top ads container
                "div.g",          # classic result card
                "h3",             # any result heading
            ]
        elif "bing." in netloc:
            return ["#b_results li.b_algo", "li.b_ad", "#b_results"]
        else:
            return ["body"]

    def get_html_without_js(self, url: str) -> str:
        try:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            response = requests.get(url, headers=headers, timeout=60)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"[requests] {url} failed: {e}")
            return ""

    def get_with_fallback(self, url: str) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/124.0.0.0 Safari/537.36"
        }
        try:
            time.sleep(random.uniform(1.5, 3.5))
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            raise TimeoutError(f"Failed to load {url}: {e}")
