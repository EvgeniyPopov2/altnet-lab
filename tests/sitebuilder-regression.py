"""Повторяемый набор браузерных проверок в изолированных профилях Chrome."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlparse

CASES = [
    ("всплывающее окно, триггеры и возврат фокуса", "--elementor-popup-smoke"),
    ("текст вдоль SVG и плеер по выбору посетителя", "--elementor-publishing-smoke"),
    ("общие классы, адаптивное оформление и экспорт", "--elementor-classes-smoke"),
    ("вкладки каждого виджета на трёх размерах и в двух темах", "--elementor-matrix-smoke"),
    ("свои пропорции и колонки CSS Grid", "--elementor-custom-grid-smoke"),
    ("Flexbox, размерности и трансформация", "--elementor-layout-smoke"),
    ("медиатека и лайтбокс в изолированном просмотре", "--elementor-library-smoke"),
    ("записи, рубрики и пагинация Loop Grid", "--elementor-loop-smoke"),
    ("общая шапка сайта и условия", "--elementor-templates-smoke"),
    ("локальная анимация и карта", "--elementor-animation-smoke"),
    ("редактор и темы", "--builder-chrome-smoke"),
    ("размеры редактора и темы", "--viewport-audit"),
    ("касание на телефоне", "--mobile-touch-smoke"),
    ("касание и вставка в ячейку", "--mobile-grid-touch-smoke"),
    ("перестановка блоков касанием", "--mobile-sort-touch-smoke"),
    ("адаптивность опубликованного HTML", "--published-viewport-smoke"),
    ("многострочная сетка", "--grid-rows-smoke"),
    ("объединение ячеек", "--grid-merge-smoke"),
    ("изображение: ползунки", "--inspector-sliders-smoke"),
    ("изображение: оформление и ссылка", "--image-style-smoke"),
    ("кнопка: состояния", "--button-style-smoke"),
    ("кнопка: иконки и отступы", "--button-icon-padding-smoke"),
    ("кнопка: градиент и тень", "--button-effects-smoke"),
    ("заголовок: семантика", "--heading-semantics-smoke"),
    ("страницы", "--pages-smoke"),
    ("многостраничная публикация", "--multipage-publication-smoke"),
    ("проекты", "--projects-smoke"),
    ("предпросмотр", "--preview-smoke"),
    ("ревизии", "--revisions-smoke"),
    ("восстановление хранилища", "--storage-smoke"),
    ("состояние публикаций", "--publication-health-smoke"),
    ("хранилище публикаций", "--publish-storage-smoke"),
    ("параллельные вкладки", "--concurrency-smoke"),
    ("браузер без Web Locks", "--no-locks-smoke"),
    ("основной сквозной сценарий", None),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser", help="Путь к Chrome или Chromium")
    parser.add_argument("--url", default="http://127.0.0.1:5179/", help="Адрес запущенного локального Vite")
    parser.add_argument("--report", help="Путь JSON-отчёта (необязательно)")
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.port not in (5174, 5179):
        parser.error("Для полного набора нужен локальный Vite на порту 5174 или 5179")
    test_script = Path(__file__).with_name("sitebuilder-drag-ui.py")
    results = []
    for name, flag in CASES:
        print(f"\nПроверка: {name}", flush=True)
        command = [sys.executable, "-B", str(test_script), args.browser, "--url", args.url]
        if flag:
            command.append(flag)
        start = time.monotonic()
        try:
            completed = subprocess.run(command, env=os.environ.copy(), timeout=300, check=False)
            status = "passed" if completed.returncode == 0 else "failed"
            code = completed.returncode
        except subprocess.TimeoutExpired:
            status, code = "timeout", None
            print("Превышено время ожидания сценария.", flush=True)
        results.append({"name": name, "flag": flag, "status": status, "exit_code": code, "seconds": round(time.monotonic() - start, 2)})
    failed = [item for item in results if item["status"] != "passed"]
    print(f"\nРезультат: {len(results)-len(failed)}/{len(results)} сценариев успешно", flush=True)
    for item in failed:
        print(f"  {item['status']}: {item['name']}", flush=True)
    if args.report:
        Path(args.report).write_text(json.dumps({"url": args.url, "cases": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
